export interface WpRenderedField {
  rendered: string;
}

export type WpAdditionalData = Record<string, unknown>;

export interface WpTerm<Taxonomy extends string = string> {
  id: number;
  termId: number;
  taxonomy: Taxonomy;
  slug: string;
  name: string;
  description: string;
  link: string;
  parent: number;
  count: number;
}

export interface WpMediaSize {
  file: string;
  width: number;
  height: number;
  mimeType: string;
  url: string;
}

export interface WpMediaItem {
  id: number;
  url: string;
  alt: string;
  caption: string;
  title: string;
  description: string;
  mimeType: string;
  mediaType: 'image' | 'file' | string;
  width: number | null;
  height: number | null;
  sizes: Record<string, WpMediaSize>;
}

export type WpContentItem<
  PostType extends string = string,
  AdditionalData extends WpAdditionalData = WpAdditionalData,
> = {
  id: number;
  slug: string;
  type: PostType;
  link: string;
  title: WpRenderedField;
  content: WpRenderedField;
  excerpt?: WpRenderedField;
  date?: string;
  modified?: string;
  acf: Record<string, unknown>;
  taxonomies: Record<string, number[]>;
  terms: Record<string, WpTerm[]>;
  featuredMediaId: number;
  featuredMedia: WpMediaItem | null;
} & AdditionalData;

export interface WpArchivePayload {
  items: WpContentItem[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

interface BaseArchiveResolution {
  found: true;
  slug: string;
  postType: string;
  restBase: string;
  title: string;
  page?: number;
}

export type WpBridgeResolution =
  | {
      found: true;
      kind: 'page' | 'single';
      id: number;
      slug: string;
      postType: string;
      restBase: string;
      isFrontPage?: boolean;
      isPostsPage?: boolean;
    }
  | (BaseArchiveResolution & {
      kind: 'postsArchive' | 'postTypeArchive';
    })
  | (BaseArchiveResolution & {
      kind: 'taxonomyArchive';
      taxonomy: string;
      taxonomyRestBase: string;
      termId: number;
      termName: string;
    })
  | (BaseArchiveResolution & {
      kind: 'search';
      search: string;
    })
  | {
      found: false;
      kind: 'notFound';
    };

export type WpResolvedRoute =
  | {
      kind: 'page';
      postType: 'page';
      restBase: 'pages';
      slug: string;
      item: WpContentItem<'page'>;
      isFrontPage?: boolean;
    }
  | {
      kind: 'single';
      postType: string;
      restBase: string;
      slug: string;
      item: WpContentItem;
    }
  | {
      kind: 'postsArchive' | 'postTypeArchive';
      postType: string;
      restBase: string;
      slug: string;
      title: string;
      items: WpContentItem[];
      page: number;
      perPage: number;
      total: number;
      totalPages: number;
    }
  | {
      kind: 'search';
      postType: string;
      restBase: string;
      slug: string;
      title: string;
      items: WpContentItem[];
      page: number;
      perPage: number;
      total: number;
      totalPages: number;
      search: string;
    }
  | {
      kind: 'taxonomyArchive';
      postType: string;
      restBase: string;
      slug: string;
      title: string;
      items: WpContentItem[];
      page: number;
      perPage: number;
      total: number;
      totalPages: number;
      taxonomy: string;
      taxonomyRestBase: string;
      termId: number;
      termName: string;
    };

export async function resolveWordPressRoute(pathname: string): Promise<WpResolvedRoute | null> {
  const resolution = await resolveViaWordPress(pathname);

  if (!resolution.found) {
    return null;
  }

  switch (resolution.kind) {
    case 'postsArchive':
    case 'postTypeArchive': {
      const archive = await getArchive({
        kind: resolution.kind,
        postType: resolution.postType,
        page: resolution.page ?? 1,
      });
      return {
        kind: resolution.kind,
        postType: resolution.postType,
        restBase: resolution.restBase,
        slug: resolution.slug,
        title: resolution.title,
        ...archive,
      };
    }
    case 'taxonomyArchive': {
      const archive = await getArchive({
        kind: resolution.kind,
        postType: resolution.postType,
        taxonomy: resolution.taxonomy,
        termId: resolution.termId,
        page: resolution.page ?? 1,
      });
      return {
        kind: 'taxonomyArchive',
        postType: resolution.postType,
        restBase: resolution.restBase,
        slug: resolution.slug,
        title: resolution.title,
        taxonomy: resolution.taxonomy,
        taxonomyRestBase: resolution.taxonomyRestBase,
        termId: resolution.termId,
        termName: resolution.termName,
        ...archive,
      };
    }
    case 'search': {
      const archive = await getArchive({
        kind: resolution.kind,
        search: resolution.search,
        page: resolution.page ?? 1,
      });
      return {
        kind: 'search',
        postType: resolution.postType,
        restBase: resolution.restBase,
        slug: resolution.slug,
        title: resolution.title,
        search: resolution.search,
        ...archive,
      };
    }
    case 'page':
    case 'single':
      break;
  }

  if (resolution.isPostsPage) {
    const archive = await getArchive({ kind: 'postsArchive', postType: 'post', page: 1 });
    return {
      kind: 'postsArchive',
      postType: 'post',
      restBase: 'posts',
      slug: resolution.slug,
      title: '',
      ...archive,
    };
  }

  if (resolution.kind === 'page') {
    const item = await getById<'page'>(resolution.restBase, resolution.id);
    return {
      kind: 'page',
      postType: 'page',
      restBase: 'pages',
      slug: resolution.slug,
      item,
      isFrontPage: resolution.isFrontPage,
    };
  }

  const item = await getById(resolution.restBase, resolution.id);
  return {
    kind: 'single',
    postType: resolution.postType,
    restBase: resolution.restBase,
    slug: resolution.slug,
    item,
  };
}

export function getWordPressApiBase() {
  const base = getWordPressBaseUrl();
  return `${base}/wp-json/wp/v2`;
}

export function getWordPressBaseUrl() {
  return (process.env.ASTROPRESS_PUBLIC_URL ?? process.env.WP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

async function resolveViaWordPress(pathname: string) {
  const url = new URL(`${getWordPressBaseUrl()}/wp-json/astropress/v1/resolve`);
  url.searchParams.set('path', pathname || '/');

  const response = await fetch(url);

  if (response.status === 404) {
    return { found: false, kind: 'notFound' } satisfies WpBridgeResolution;
  }

  if (!response.ok) {
    throw new Error(`AstroPress route resolution failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<WpBridgeResolution>;
}

async function getById<PostType extends string = string>(restBase: string, id: number) {
  const url = new URL(`${getWordPressBaseUrl()}/wp-json/astropress/v1/post`);
  url.searchParams.set('id', String(id));
  url.searchParams.set('restBase', restBase);

  return getJson<WpContentItem<PostType>>(url);
}

async function getArchive(params: Record<string, string | number | undefined>) {
  const url = new URL(`${getWordPressBaseUrl()}/wp-json/astropress/v1/archive`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return getJson<WpArchivePayload>(url);
}

async function getJson<T>(url: URL): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`WordPress REST request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}
