import type { CacheHint, LiveDataCollection, LiveDataEntry } from 'astro';
import type { LiveLoader as AstroLiveLoader } from 'astro/loaders';
import { getMenus, type WpMenu } from './wordpress/menus.js';
import {
  getWordPressApiBase,
  getWordPressBaseUrl,
  resolveWordPressRoute,
  type WpContentItem,
  type WpResolvedRoute,
} from './wordpress/client.js';

export type LiveCacheHint = CacheHint;
export type LiveEntry<TData extends Record<string, any>> = LiveDataEntry<TData>;
export type LiveCollection<TData extends Record<string, any>> = LiveDataCollection<TData>;
export type LiveLoader<
  TData extends Record<string, any>,
  TEntryFilter extends Record<string, any> | never,
  TCollectionFilter extends Record<string, any> | never,
> = AstroLiveLoader<TData, TEntryFilter, TCollectionFilter>;

export interface WpRouteEntryFilter {
  path?: string;
  id?: string;
}

export interface WpRouteCollectionFilter {
  paths?: string[];
}

export function wpRouteLoader(): LiveLoader<WpResolvedRouteData, WpRouteEntryFilter, WpRouteCollectionFilter> {
  return {
    name: 'astropress:routes',
    async loadEntry({ filter }) {
      const path = filter.path ?? filter.id ?? '/';
      const route = await resolveWordPressRoute(path);

      if (!route) {
        return undefined;
      }

      return {
        id: normalizeRouteId(path),
        data: route as WpResolvedRouteData,
        cacheHint: routeCacheHint(path, route),
      };
    },
    async loadCollection({ filter }) {
      const paths = filter?.paths ?? ['/'];
      const entries: Array<LiveEntry<WpResolvedRouteData>> = [];

      for (const path of paths) {
        const route = await resolveWordPressRoute(path);
        if (route) {
          entries.push({
            id: normalizeRouteId(path),
            data: route as WpResolvedRouteData,
            cacheHint: routeCacheHint(path, route),
          });
        }
      }

      return {
        entries,
        cacheHint: mergeCacheHints(entries.map((entry) => entry.cacheHint)),
      };
    },
  };
}

export interface WpPostTypeLoaderOptions {
  postType: string;
  restBase?: string;
}

export interface WpPostEntryFilter {
  id?: string | number;
  slug?: string;
}

export interface WpPostCollectionFilter {
  page?: number;
  perPage?: number;
  search?: string;
  slug?: string;
}

export function wpPostTypeLoader(options: WpPostTypeLoaderOptions): LiveLoader<WpContentItemData, WpPostEntryFilter, WpPostCollectionFilter> {
  const restBase = options.restBase ?? defaultRestBase(options.postType);

  return {
    name: `astropress:${options.postType}`,
    async loadEntry({ filter }) {
      const item = filter.id !== undefined
        ? await fetchWordPressItemById(restBase, filter.id)
        : filter.slug
          ? await fetchWordPressItemBySlug(restBase, filter.slug)
          : undefined;

      if (!item) {
        return undefined;
      }

      return contentEntry(item);
    },
    async loadCollection({ filter }) {
      const url = new URL(`${getWordPressApiBase()}/${restBase}`);
      url.searchParams.set('_embed', '1');
      url.searchParams.set('page', String(filter?.page ?? 1));
      url.searchParams.set('per_page', String(filter?.perPage ?? 10));

      if (filter?.search) {
        url.searchParams.set('search', filter.search);
      }

      if (filter?.slug) {
        url.searchParams.set('slug', filter.slug);
      }

      const { items } = await fetchWordPressList(url);
      const entries = items.map(contentEntry);

      return {
        entries,
        cacheHint: mergeCacheHints(entries.map((entry) => entry.cacheHint)),
      };
    },
  };
}

export interface WpMenuEntryFilter {
  id?: string | number;
  slug?: string;
  location?: string;
}

export interface WpMenuCollectionFilter {
  location?: string;
}

export function wpMenuLoader(): LiveLoader<WpMenuData, WpMenuEntryFilter, WpMenuCollectionFilter> {
  return {
    name: 'astropress:menus',
    async loadEntry({ filter }) {
      const payload = await getMenus();
      const locationId = filter.location ? payload.locations[filter.location] : undefined;
      const menu = payload.menus.find((candidate) => {
        return candidate.id === Number(filter.id ?? locationId)
          || candidate.slug === filter.slug;
      });

      return menu ? menuEntry(menu) : undefined;
    },
    async loadCollection({ filter }) {
      const payload = await getMenus();
      const locationId = filter?.location ? payload.locations[filter.location] : undefined;
      const menus = locationId
        ? payload.menus.filter((menu) => menu.id === locationId)
        : payload.menus;

      return {
        entries: menus.map(menuEntry),
        cacheHint: { tags: ['wordpress:menus'] },
      };
    },
  };
}

type WpResolvedRouteData = WpResolvedRoute & Record<string, unknown>;
type WpContentItemData = WpContentItem & Record<string, unknown>;
type WpMenuData = WpMenu & Record<string, unknown>;

function defaultRestBase(postType: string) {
  if (postType === 'post') {
    return 'posts';
  }

  if (postType === 'page') {
    return 'pages';
  }

  return postType;
}

async function fetchWordPressItemById(restBase: string, id: string | number) {
  return fetchBridgePost(id, restBase);
}

async function fetchWordPressItemBySlug(restBase: string, slug: string) {
  const url = new URL(`${getWordPressApiBase()}/${restBase}`);
  url.searchParams.set('_embed', '1');
  url.searchParams.set('slug', slug);

  const { items } = await fetchWordPressList(url);
  const item = items[0];
  return item ? fetchBridgePost(item.id, restBase) : undefined;
}

async function fetchWordPressList(url: URL) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`WordPress REST request failed: ${response.status} ${response.statusText}`);
  }

  const restItems = await response.json() as WpContentItem[];
  const items = await Promise.all(restItems.map((item) => fetchBridgePost(item.id).then((bridgeItem) => bridgeItem ?? item)));
  return {
    items,
    total: Number(response.headers.get('x-wp-total') ?? items.length),
    totalPages: Number(response.headers.get('x-wp-totalpages') ?? 1),
  };
}

async function fetchBridgePost(id: string | number, restBase?: string) {
  const url = new URL(`${getWordPressBaseUrl()}/wp-json/astropress/v1/post`);
  url.searchParams.set('id', String(id));

  if (restBase) {
    url.searchParams.set('restBase', restBase);
  }

  return fetchWordPressJson<WpContentItem>(url, [404]);
}

async function fetchWordPressJson<T>(url: URL, emptyStatuses: number[] = []): Promise<T | undefined> {
  const response = await fetch(url);

  if (emptyStatuses.includes(response.status)) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`WordPress REST request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function contentEntry(item: WpContentItem): LiveEntry<WpContentItemData> {
  return {
    id: String(item.id),
    data: item as WpContentItemData,
    cacheHint: {
      tags: [`wordpress:${item.type}`, `wordpress:${item.type}:${item.id}`],
      lastModified: item.modified ? new Date(item.modified) : undefined,
    },
  };
}

function menuEntry(menu: WpMenu): LiveEntry<WpMenuData> {
  return {
    id: String(menu.id),
    data: menu as WpMenuData,
    cacheHint: {
      tags: ['wordpress:menus', `wordpress:menu:${menu.slug}`],
    },
  };
}

function routeCacheHint(path: string, route: WpResolvedRoute): LiveCacheHint {
  if (route.kind === 'page' || route.kind === 'single') {
    return {
      tags: [`wordpress:route:${normalizeRouteId(path)}`, `wordpress:${route.postType}:${route.item.id}`],
      lastModified: route.item.modified ? new Date(route.item.modified) : undefined,
    };
  }

  return {
    tags: [`wordpress:route:${normalizeRouteId(path)}`, `wordpress:${route.kind}`],
  };
}

function mergeCacheHints(hints: Array<LiveCacheHint | undefined>): LiveCacheHint | undefined {
  const tags = new Set<string>();
  let lastModified: Date | undefined;

  for (const hint of hints) {
    hint?.tags?.forEach((tag) => tags.add(tag));

    if (hint?.lastModified && (!lastModified || hint.lastModified > lastModified)) {
      lastModified = hint.lastModified;
    }
  }

  if (tags.size === 0 && !lastModified) {
    return undefined;
  }

  return {
    tags: [...tags],
    lastModified,
  };
}

function normalizeRouteId(path: string) {
  return path || '/';
}
