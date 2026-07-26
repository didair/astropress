import type { TemplateContext } from './templates.js';
import { getOptionalRequestContext } from './context.js';

export interface HookRenderResult {
  hook: string;
  type: 'action';
  rendered: string;
  cached: boolean;
  cacheKey: string;
}

export interface HookFilterResult<T = unknown> {
  hook: string;
  type: 'filter';
  value: T;
  rendered: string;
  cached: boolean;
  cacheKey: string;
}

export interface HookOptions {
  args?: unknown[];
  cache?: boolean;
  ttl?: number;
}

export interface Hooks {
  action: (hook: string, options?: HookOptions) => Promise<HookRenderResult>;
  filter: <T = unknown>(hook: string, value: T, options?: HookOptions) => Promise<HookFilterResult<T>>;
}

interface InternalHookResponse<T = unknown> {
  hook: string;
  type: 'action' | 'filter';
  rendered?: string;
  value?: T;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const cache = new Map<string, CacheEntry<HookRenderResult | HookFilterResult>>();

export function createHooks(context: TemplateContext): Hooks {
  return {
    action: (hook, options = {}) => renderAction(context, hook, options),
    filter: (hook, value, options = {}) => applyFilter(context, hook, value, options),
  };
}

export async function renderAction(
  context: TemplateContext,
  hook: string,
  options: HookOptions = {},
): Promise<HookRenderResult> {
  const cacheKey = createCacheKey('action', hook, context, undefined, options.args);
  const cached = readCache<HookRenderResult>(cacheKey, options);

  if (cached) {
    return { ...cached, cached: true };
  }

  const response = await callWordPressHook<string>({
    type: 'action',
    hook,
    context,
    args: options.args ?? [],
  });
  const result: HookRenderResult = {
    hook,
    type: 'action',
    rendered: response.rendered ?? '',
    cached: false,
    cacheKey,
  };

  writeCache(cacheKey, result, options);
  return result;
}

export async function applyFilter<T = unknown>(
  context: TemplateContext,
  hook: string,
  value: T,
  options: HookOptions = {},
): Promise<HookFilterResult<T>> {
  const cacheKey = createCacheKey('filter', hook, context, value, options.args);
  const cached = readCache<HookFilterResult<T>>(cacheKey, options);

  if (cached) {
    return { ...cached, cached: true };
  }

  const response = await callWordPressHook<T>({
    type: 'filter',
    hook,
    context,
    value,
    args: options.args ?? [],
  });
  const result: HookFilterResult<T> = {
    hook,
    type: 'filter',
    value: (response.value ?? value) as T,
    rendered: response.rendered ?? String(response.value ?? ''),
    cached: false,
    cacheKey,
  };

  writeCache(cacheKey, result, options);
  return result;
}

async function callWordPressHook<T>(body: {
  type: 'action' | 'filter';
  hook: string;
  context: TemplateContext;
  value?: unknown;
  args: unknown[];
}) {
  const phpUrl = process.env.ASTROPRESS_PHP_URL;
  const secret = process.env.ASTROPRESS_INTERNAL_SECRET;

  if (!phpUrl || !secret) {
    throw new Error('WordPress hooks are only available during AstroPress SSR. Start the site with `astropress dev`.');
  }

  const response = await fetch(`${phpUrl.replace(/\/$/, '')}/index.php?astropress_internal_hook=1`, {
    method: 'POST',
    headers: hookRequestHeaders(secret),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`WordPress hook "${body.hook}" failed: ${response.status} ${message}`);
  }

  return response.json() as Promise<InternalHookResponse<T>>;
}

function hookRequestHeaders(secret: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-astropress-internal-secret': secret,
  };
  const context = getOptionalRequestContext();

  if (context?.cookie) {
    headers.cookie = context.cookie;
  }

  const publicUrl = process.env.ASTROPRESS_PUBLIC_URL;

  if (publicUrl) {
    const url = new URL(publicUrl);
    headers['x-forwarded-host'] = url.host;
    headers['x-forwarded-proto'] = url.protocol.replace(':', '');

    if (url.port) {
      headers['x-forwarded-port'] = url.port;
    }

    if (url.protocol === 'https:') {
      headers['x-forwarded-ssl'] = 'on';
    }
  }

  return headers;
}

function createCacheKey(
  type: 'action' | 'filter',
  hook: string,
  context: TemplateContext,
  value: unknown,
  args: unknown[] | undefined,
) {
  return JSON.stringify({
    type,
    hook,
    context: context.cacheKey,
    route: context.route.kind,
    slug: context.slug,
    postType: context.postType,
    page: context.page,
    value,
    args,
  });
}

function readCache<T extends HookRenderResult | HookFilterResult>(key: string, options: HookOptions): T | null {
  if (!shouldCache(options)) return null;

  const entry = cache.get(key);

  if (!entry) return null;

  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

function writeCache(key: string, value: HookRenderResult | HookFilterResult, options: HookOptions) {
  if (!shouldCache(options)) return;

  cache.set(key, {
    expiresAt: Date.now() + ttl(options) * 1000,
    value,
  });
}

function shouldCache(options: HookOptions) {
  if (options.cache === false || process.env.ASTROPRESS_HOOKS_CACHE === '0') return false;
  if (process.env.NODE_ENV === 'development' && process.env.ASTROPRESS_HOOKS_CACHE !== '1') return false;
  return true;
}

function ttl(options: HookOptions) {
  return options.ttl ?? Number(process.env.ASTROPRESS_HOOKS_CACHE_TTL ?? 300);
}
