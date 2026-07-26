import { AsyncLocalStorage } from 'node:async_hooks';

export interface AstroPressAstroLike {
  request: Request;
  response?: {
    headers?: Headers;
  };
  url?: URL;
  locals?: App.Locals;
  redirect?: (path: string, status?: 300 | 301 | 302 | 303 | 304 | 307 | 308) => Response;
}

export interface AstroPressRequestContext {
  request: Request;
  url: URL;
  headers: Headers;
  cookie: string;
  wooCartToken?: string;
  responseHeaders?: Headers;
  responseCookies: string[];
  locals?: App.Locals;
  redirect?: (path: string, status?: 300 | 301 | 302 | 303 | 304 | 307 | 308) => Response;
  cache: Map<string, unknown>;
}

const requestContext = new AsyncLocalStorage<AstroPressRequestContext>();

export function runWithRequestContext<T>(astro: AstroPressAstroLike, callback: () => T): T {
  return requestContext.run(createRequestContext(astro), callback);
}

export function getRequestContext(astro?: AstroPressAstroLike): AstroPressRequestContext {
  const context = requestContext.getStore();

  if (astro) {
    if (context?.request === astro.request) {
      return context;
    }

    return createRequestContext(astro);
  }

  if (!context) {
    throw new Error('No AstroPress request context found. Use this helper during Astro SSR or pass the Astro object explicitly.');
  }

  return context;
}

export function getOptionalRequestContext(): AstroPressRequestContext | null {
  return requestContext.getStore() ?? null;
}

export function forwardResponseCookies(response: Response, context: AstroPressRequestContext): void {
  for (const cookie of getResponseSetCookies(response.headers)) {
    context.responseHeaders?.append('set-cookie', cookie);
    context.responseCookies.push(cookie);
  }
}

function createRequestContext(astro: AstroPressAstroLike): AstroPressRequestContext {
  const headers = astro.request.headers;
  return {
    request: astro.request,
    url: astro.url ?? new URL(astro.request.url),
    headers,
    cookie: headers.get('cookie') ?? '',
    wooCartToken: readCookie(headers.get('cookie') ?? '', 'astropress_woocommerce_cart_token'),
    responseHeaders: astro.response?.headers,
    responseCookies: [],
    locals: astro.locals,
    redirect: astro.redirect,
    cache: new Map(),
  };
}

function getResponseSetCookies(headers: Headers): string[] {
  const withCookieHelpers = headers as Headers & {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[] | undefined>;
  };

  if (withCookieHelpers.getSetCookie) {
    const cookies = withCookieHelpers.getSetCookie();
    if (cookies.length > 0) return cookies;
  }

  const rawCookies = withCookieHelpers.raw?.()['set-cookie'];

  if (rawCookies?.length) {
    return rawCookies;
  }

  const cookie = headers.get('set-cookie');
  return cookie ? splitCombinedSetCookieHeader(cookie) : [];
}

function splitCombinedSetCookieHeader(header: string): string[] {
  const cookies: string[] = [];
  let start = 0;
  let inExpires = false;

  for (let index = 0; index < header.length; index++) {
    const char = header[index];

    if (char === ',') {
      if (looksLikeCookieStart(header.slice(index + 1))) {
        cookies.push(header.slice(start, index).trim());
        start = index + 1;
        inExpires = false;
      }
      continue;
    }

    if (char === ';') {
      inExpires = false;
      continue;
    }

    if (!inExpires && header.slice(index, index + 8).toLowerCase() === 'expires=') {
      inExpires = true;
      index += 7;
    }
  }

  cookies.push(header.slice(start).trim());
  return cookies.filter(Boolean);
}

function looksLikeCookieStart(value: string): boolean {
  return /^\s*[^=;,\s]+=/.test(value);
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
