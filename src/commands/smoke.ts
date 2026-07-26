import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { loadAstroPressConfig } from '../config.js';

interface SmokeCheck {
  label: string;
  run: () => Promise<string>;
}

export async function runSmoke() {
  const config = await loadAstroPressConfig();
  const baseUrl = config.wordpress.url.replace(/\/$/, '');
  const checks: SmokeCheck[] = [
    {
      label: 'Unified frontend route',
      run: () => expectHttp(`${baseUrl}/`, [200]),
    },
    {
      label: 'AstroPress dev route metadata',
      run: () => expectBody(`${baseUrl}/`, 'window.__ASTROPRESS_ROUTE_INFO__'),
    },
    {
      label: 'WordPress admin route',
      run: () => expectHttp(`${baseUrl}/wp-admin/`, [200, 302]),
    },
    {
      label: 'Vite client through proxy',
      run: () => expectHttp(`${baseUrl}/@vite/client`, [200], 'text/javascript'),
    },
    {
      label: 'wp-content static asset',
      run: () => expectHttp(`${baseUrl}/wp-content/themes/astropress/style.css`, [200], 'text/css'),
    },
    {
      label: 'AstroPress route bridge',
      run: () => expectJson(`${baseUrl}/wp-json/astropress/v1/resolve?path=/`, ['found', 'kind']),
    },
    {
      label: 'AstroPress type metadata',
      run: () => expectJson(`${baseUrl}/wp-json/astropress/v1/types`, ['postTypes', 'taxonomies']),
    },
    {
      label: 'Internal hook endpoint is not public',
      run: () => expectHttp(`${baseUrl}/index.php?astropress_internal_hook=1`, [403], 'application/json'),
    },
    {
      label: 'Vite HMR websocket',
      run: () => expectWebSocket(baseUrl),
    },
  ];

  console.log('AstroPress smoke test');
  console.log('');

  let failures = 0;

  for (const check of checks) {
    try {
      const detail = await check.run();
      console.log(`✓ ${check.label}${detail ? ` — ${detail}` : ''}`);
    } catch (error) {
      failures += 1;
      console.log(`✕ ${check.label} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('');
  console.log(`Smoke test finished with ${failures} failure(s).`);
  process.exitCode = failures > 0 ? 1 : 0;
}

async function expectHttp(url: string, statuses: number[], expectedContentType?: string) {
  const response = await fetchWithTimeout(url, { method: 'GET' });
  const contentType = response.headers.get('content-type') ?? '';

  if (!statuses.includes(response.status)) {
    throw new Error(`Expected ${statuses.join('/')} from ${url}, got ${response.status}.`);
  }

  if (expectedContentType && !contentType.includes(expectedContentType)) {
    throw new Error(`Expected content-type ${expectedContentType}, got ${contentType || 'none'}.`);
  }

  await response.body?.cancel();
  return `${response.status}${contentType ? ` ${contentType}` : ''}`;
}

async function expectJson(url: string, keys: string[]) {
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Expected 2xx from ${url}, got ${response.status}.`);
  }

  const json = await response.json() as Record<string, unknown>;
  const missing = keys.filter((key) => !(key in json));

  if (missing.length > 0) {
    throw new Error(`Missing JSON key(s): ${missing.join(', ')}.`);
  }

  return `${response.status}`;
}

async function expectBody(url: string, needle: string) {
  const response = await fetchWithTimeout(url);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Expected 2xx from ${url}, got ${response.status}.`);
  }

  if (!body.includes(needle)) {
    throw new Error(`Expected response body to include ${needle}.`);
  }

  return `${response.status}`;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timeout);
  }
}

function expectWebSocket(baseUrl: string): Promise<string> {
  const url = new URL(baseUrl);
  const host = url.hostname;
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const key = randomBytes(16).toString('base64');

  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host, () => {
      socket.write([
        'GET / HTTP/1.1',
        `Host: ${url.host}`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Protocol: vite-hmr',
        '',
        '',
      ].join('\r\n'));
    });

    socket.setTimeout(5000);
    socket.once('data', (data) => {
      const firstLine = data.toString().split('\r\n')[0] ?? '';
      socket.destroy();

      if (!firstLine.includes('101')) {
        reject(new Error(`Expected 101 Switching Protocols, got ${firstLine || 'no response'}.`));
        return;
      }

      resolve('101 Switching Protocols');
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('Timed out waiting for websocket upgrade.'));
    });
    socket.once('error', reject);
  });
}
