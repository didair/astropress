import { forwardResponseCookies, getOptionalRequestContext } from './context.js';
import type { TemplateContext } from './templates.js';

export interface RenderWordPressPageOptions {
  postId?: number;
  context?: TemplateContext;
  contentFilter?: string;
  include?: string[];
  cartToken?: string;
  cache?: boolean;
}

export interface RenderedWordPressPage {
  ok: true;
  postId: number;
  postType: string;
  contentFilter: string;
  include: string[];
  content: string;
  fragments: Record<string, string>;
}

export async function renderWordPressPage(
  input: TemplateContext | RenderWordPressPageOptions = {},
): Promise<RenderedWordPressPage> {
  const options = normalizeRenderOptions(input);
  const phpUrl = process.env.ASTROPRESS_PHP_URL;
  const secret = process.env.ASTROPRESS_INTERNAL_SECRET;

  if (!phpUrl || !secret) {
    throw new Error('WordPress page rendering is only available during AstroPress SSR. Start the site with `astropress dev`.');
  }

  const requestContext = getOptionalRequestContext();
  const shouldCache = options.cache !== false;
  const response = await fetch(renderUrl(phpUrl, shouldCache), {
    method: 'POST',
    cache: shouldCache ? 'default' : 'no-store',
    headers: renderRequestHeaders(secret, options.cartToken, shouldCache),
    body: JSON.stringify({
      postId: options.postId,
      context: options.context,
      contentFilter: options.contentFilter ?? 'the_content',
      include: options.include ?? ['wp_head', 'wp_body_open', 'wp_footer'],
      cartToken: options.cartToken,
      cache: shouldCache,
    }),
  });

  if (!shouldCache && requestContext?.responseHeaders) {
    requestContext.responseHeaders.set('cache-control', 'private, no-store, max-age=0');
    requestContext.responseHeaders.set('pragma', 'no-cache');
  }

  if (requestContext) {
    forwardResponseCookies(response, requestContext);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`WordPress page rendering failed: ${response.status} ${message}`);
  }

  return response.json() as Promise<RenderedWordPressPage>;
}


function renderUrl(phpUrl: string, shouldCache: boolean) {
  const url = new URL(`${phpUrl.replace(/\/$/, '')}/index.php`);
  url.searchParams.set('astropress_internal_render_post', '1');

  if (!shouldCache) {
    url.searchParams.set('astropress_no_cache', String(Date.now()));
  }

  return url;
}

function normalizeRenderOptions(input: TemplateContext | RenderWordPressPageOptions): RenderWordPressPageOptions {
  if (isTemplateContext(input)) {
    return {
      context: input,
      postId: 'item' in input ? input.item.id : undefined,
    };
  }

  return input;
}

function isTemplateContext(input: TemplateContext | RenderWordPressPageOptions): input is TemplateContext {
  return Boolean(input && typeof input === 'object' && 'kind' in input && 'route' in input);
}

function renderRequestHeaders(secret: string, cartTokenOverride: string | undefined, shouldCache: boolean) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-astropress-internal-secret': secret,
  };
  const context = getOptionalRequestContext();

  if (context?.cookie) {
    headers.cookie = context.cookie;
  }

  const cartToken = cartTokenOverride ?? context?.wooCartToken ?? readCookie(context?.cookie ?? '', 'astropress_woocommerce_cart_token');

  if (cartToken) {
    headers['cart-token'] = cartToken;
  }

  if (!shouldCache) {
    headers['cache-control'] = 'no-store';
    headers.pragma = 'no-cache';
    headers['x-astropress-no-cache'] = '1';
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
