import { createReadStream, statSync } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, normalize, resolve, sep } from 'node:path';
import type { Duplex } from 'node:stream';
import { URL } from 'node:url';
import type { LoadedAstroPressConfig } from '../config.js';

export interface ProxyServer {
  url: string;
  stop: () => Promise<void>;
}

const wordpressPrefixes = [
  '/wp-admin',
  '/wp-content',
  '/wp-includes',
  '/wp-json',
];

const wordpressFiles = [
  '/index.php',
  '/wp-login.php',
  '/wp-cron.php',
  '/wp-comments-post.php',
  '/wp-trackback.php',
  '/xmlrpc.php',
  '/favicon.ico',
];

const wooCartTokenCookie = 'astropress_woocommerce_cart_token';

export async function startUnifiedProxy(config: LoadedAstroPressConfig): Promise<ProxyServer> {
  const publicUrl = new URL(config.wordpress.url);
  const listenHost = config.dev.proxyHost || publicUrl.hostname;
  const listenPort = config.dev.proxyPort || Number(publicUrl.port || 3000);
  const phpUrl = new URL(`http://${config.dev.phpHost}:${config.dev.phpPort}`);
  const astroUrl = new URL(`http://${config.dev.astroHost}:${config.dev.astroPort}`);
  const contentDir = resolve(config.root, config.wordpress.contentDir);

  const server = http.createServer((request, response) => {
    if (serveWpContentAsset(request, response, contentDir)) {
      return;
    }

    proxyHttpRequest(request, response, selectTarget(request.url ?? '/', phpUrl, astroUrl, config), publicUrl);
  });

  server.on('upgrade', (request, socket, head) => {
    proxyUpgrade(request, socket, head, selectTarget(request.url ?? '/', phpUrl, astroUrl, config), publicUrl);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, listenHost, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    url: publicUrl.toString().replace(/\/$/, ''),
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function selectTarget(path: string, phpUrl: URL, astroUrl: URL, config: LoadedAstroPressConfig) {
  return isWordPressRequest(path, config) ? phpUrl : astroUrl;
}

function isWordPressRequest(path: string, config: LoadedAstroPressConfig) {
  const url = new URL(path, 'http://astropress.local');
  const pathname = url.pathname;
  return wordpressPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    || wordpressFiles.includes(pathname)
    || hasPhpPathSegment(pathname)
    || url.searchParams.has('wc-ajax')
    || config.wordpress.routes.wordpress.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function hasPhpPathSegment(pathname: string) {
  return /(?:^|\/)[^/]+\.php(?:\/|$)/i.test(pathname);
}

function serveWpContentAsset(request: IncomingMessage, response: ServerResponse, contentDir: string) {
  const pathname = new URL(request.url ?? '/', 'http://astropress.local').pathname;

  if (!pathname.startsWith('/wp-content/')) {
    return false;
  }

  const relativePath = decodeURIComponent(pathname.slice('/wp-content/'.length));
  const file = resolve(contentDir, normalize(relativePath));

  if (!isInside(contentDir, file)) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return true;
  }

  try {
    const stats = statSync(file);

    if (!stats.isFile()) {
      return false;
    }

    response.writeHead(200, {
      'content-type': contentType(file),
      'content-length': stats.size,
      'cache-control': 'no-cache',
    });

    if (request.method === 'HEAD') {
      response.end();
      return true;
    }

    createReadStream(file).pipe(response);
    return true;
  } catch {
    return false;
  }
}

function isInside(root: string, file: string) {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  return file.startsWith(normalizedRoot);
}

function rewriteTargetPath(path: string, target: URL, publicUrl: URL) {
  if (target.origin === publicUrl.origin) return path;

  const url = new URL(path, publicUrl);

  if (url.pathname === '/wp-json' || url.pathname.startsWith('/wp-json/')) {
    const restRoute = url.pathname.replace(/^\/wp-json\/?/, '/');
    url.pathname = '/index.php';
    url.searchParams.set('rest_route', restRoute || '/');
    return `${url.pathname}${url.search}`;
  }

  return path;
}

function proxyHttpRequest(request: IncomingMessage, response: ServerResponse, target: URL, publicUrl: URL) {
  const targetRequest = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: request.method,
      path: rewriteTargetPath(request.url ?? '/', target, publicUrl),
      headers: rewriteRequestHeaders(request, publicUrl),
    },
    (targetResponse) => {
      response.writeHead(
        targetResponse.statusCode ?? 502,
        targetResponse.statusMessage,
        rewriteResponseHeaders(targetResponse.headers, target, publicUrl),
      );
      targetResponse.pipe(response);
    },
  );

  targetRequest.on('error', (error) => {
    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`AstroPress proxy could not reach ${target.origin}: ${error.message}\n`);
  });

  request.pipe(targetRequest);
}

function proxyUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, target: URL, publicUrl: URL) {
  socket.on('error', () => undefined);

  const targetRequest = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: request.method,
    path: rewriteTargetPath(request.url ?? '/', target, publicUrl),
    headers: rewriteRequestHeaders(request, publicUrl),
  });

  targetRequest.on('upgrade', (targetResponse, targetSocket, targetHead) => {
    targetSocket.on('error', () => socket.destroy());

    socket.write(
      `HTTP/${targetResponse.httpVersion} ${targetResponse.statusCode} ${targetResponse.statusMessage}\r\n${rawHeaders(
        rewriteResponseHeaders(targetResponse.headers, target, publicUrl),
      )}\r\n\r\n`,
    );
    if (targetHead.length > 0) socket.write(targetHead);
    if (head.length > 0) targetSocket.write(head);
    targetSocket.pipe(socket);
    socket.pipe(targetSocket);
  });

  targetRequest.on('error', () => socket.destroy());
  targetRequest.on('socket', (targetSocket) => {
    targetSocket.on('error', () => socket.destroy());
  });
  targetRequest.end();
}

function rewriteRequestHeaders(request: IncomingMessage, publicUrl: URL): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = {
    ...request.headers,
    host: publicUrl.host,
    'x-forwarded-host': publicUrl.host,
    'x-forwarded-proto': publicUrl.protocol.replace(':', ''),
  };

  if (publicUrl.port) {
    headers['x-forwarded-port'] = publicUrl.port;
  }

  if (publicUrl.protocol === 'https:') {
    headers['x-forwarded-ssl'] = 'on';
  }

  const pathname = new URL(request.url ?? '/', publicUrl).pathname;
  const cartToken = readCookie(String(request.headers.cookie ?? ''), wooCartTokenCookie);

  if (cartToken && pathname.startsWith('/wp-json/wc/store/')) {
    headers['cart-token'] = cartToken;
  }

  return headers;
}

function rewriteResponseHeaders(
  headers: IncomingMessage['headers'],
  target: URL,
  publicUrl: URL,
): http.OutgoingHttpHeaders {
  const rewritten: http.OutgoingHttpHeaders = { ...headers };
  const location = headers.location;

  if (typeof location === 'string') {
    rewritten.location = location.replace(target.origin, publicUrl.origin);
  }

  const cartToken = firstHeaderValue(headers['cart-token']);

  if (cartToken) {
    rewritten['set-cookie'] = appendSetCookie(
      rewritten['set-cookie'],
      wooCartCookie(cartToken, publicUrl),
    );
  }

  delete rewritten['content-length'];
  return rewritten;
}

function wooCartCookie(cartToken: string, publicUrl: URL) {
  return [
    `${wooCartTokenCookie}=${encodeURIComponent(cartToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    publicUrl.protocol === 'https:' ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function appendSetCookie(existing: string | string[] | number | undefined, cookie: string): string[] {
  if (Array.isArray(existing)) {
    return [...existing.map(String), cookie];
  }

  if (existing === undefined) {
    return [cookie];
  }

  return [String(existing), cookie];
}

function readCookie(header: string, name: string): string | undefined {
  for (const cookie of header.split(';')) {
    const [cookieName, ...value] = cookie.trim().split('=');

    if (cookieName !== name) continue;

    try {
      return decodeURIComponent(value.join('='));
    } catch {
      return value.join('=');
    }
  }

  return undefined;
}

function rawHeaders(headers: http.OutgoingHttpHeaders) {
  return Object.entries(headers)
    .flatMap(([key, value]) => {
      if (value === undefined) return [];
      if (Array.isArray(value)) return value.map((item) => `${key}: ${item}`);
      return [`${key}: ${value}`];
    })
    .join('\r\n');
}

function contentType(file: string) {
  switch (extname(file).toLowerCase()) {
    case '.css':
      return 'text/css; charset=UTF-8';
    case '.js':
      return 'application/javascript; charset=UTF-8';
    case '.json':
      return 'application/json; charset=UTF-8';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}
