import type { WpContentItem, WpResolvedRoute } from './client.js';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

type PageRoute = Extract<WpResolvedRoute, { kind: 'page' }>;
type SingleRoute = Extract<WpResolvedRoute, { kind: 'single' }>;
type ArchiveRoute = Extract<WpResolvedRoute, { kind: 'postsArchive' | 'postTypeArchive' }>;
type SearchRoute = Extract<WpResolvedRoute, { kind: 'search' }>;
type TaxonomyRoute = Extract<WpResolvedRoute, { kind: 'taxonomyArchive' }>;

interface BaseTemplateContext {
  url: string;
  path: string;
  cacheKey: string;
  title: string;
  content: string;
  excerpt: string;
  acf: Record<string, unknown>;
  slug: string;
  postType: string;
  items: WpContentItem[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface PageTemplateContext extends BaseTemplateContext {
  kind: 'page';
  route: PageRoute;
  item: WpContentItem<'page'>;
  postType: 'page';
  isFrontPage: boolean;
}

export interface SingleTemplateContext extends BaseTemplateContext {
  kind: 'single';
  route: SingleRoute;
  item: WpContentItem;
}

export interface ArchiveTemplateContext extends BaseTemplateContext {
  kind: 'postsArchive' | 'postTypeArchive';
  route: ArchiveRoute;
}

export interface SearchTemplateContext extends BaseTemplateContext {
  kind: 'search';
  route: SearchRoute;
  search: string;
}

export interface TaxonomyTemplateContext extends BaseTemplateContext {
  kind: 'taxonomyArchive';
  route: TaxonomyRoute;
  taxonomy: string;
  taxonomyRestBase: string;
  termId: number;
  termName: string;
}

export type TemplateContext =
  | PageTemplateContext
  | SingleTemplateContext
  | ArchiveTemplateContext
  | SearchTemplateContext
  | TaxonomyTemplateContext;

export interface TemplateRouteInfo {
  path: string;
  matched: boolean;
  kind: TemplateContext['kind'] | '404';
  liveCollection: {
    collection: string;
    entryId: string;
    cacheHint: unknown;
  } | null;
  postType: string | null;
  slug: string | null;
  page: number | null;
  totalPages: number | null;
  template: string | null;
  templateSource: 'project' | 'astropress' | null;
  candidateTemplates: string[];
}

export interface LayoutTemplateProps {
  title?: string;
  toolbarRouteInfo?: TemplateRouteInfo | null;
}

export interface TemplateRuntimeProps {
  Layout: AstroComponentFactory;
  toolbarRouteInfo: TemplateRouteInfo | null;
}

export type PageTemplateProps<AdditionalData extends Record<string, unknown> = Record<string, unknown>> =
  Omit<PageTemplateContext, 'acf' | 'item' | 'route'> & AdditionalData & {
    item: WpContentItem<'page', AdditionalData>;
    route: Omit<PageRoute, 'item'> & {
      item: WpContentItem<'page', AdditionalData>;
    };
  } & TemplateRuntimeProps;
export type SingleTemplateProps<
  PostType extends string = string,
  AdditionalData extends Record<string, unknown> = Record<string, unknown>,
> =
  Omit<SingleTemplateContext, 'acf' | 'postType' | 'item' | 'route'> & AdditionalData & {
    postType: PostType;
    item: WpContentItem<PostType, AdditionalData>;
    route: Omit<SingleRoute, 'postType' | 'item'> & {
      postType: PostType;
      item: WpContentItem<PostType, AdditionalData>;
    };
  } & TemplateRuntimeProps;
export type ArchiveTemplateProps<
  PostType extends string = string,
  AdditionalData extends Record<string, unknown> = Record<string, unknown>,
> =
  Omit<ArchiveTemplateContext, 'postType' | 'items' | 'route'> & {
    postType: PostType;
    items: WpContentItem<PostType, AdditionalData>[];
    route: Omit<ArchiveRoute, 'postType' | 'items'> & {
      postType: PostType;
      items: WpContentItem<PostType, AdditionalData>[];
    };
  } & TemplateRuntimeProps;
export type SearchTemplateProps = SearchTemplateContext & TemplateRuntimeProps;
export type TaxonomyTemplateProps = TaxonomyTemplateContext & TemplateRuntimeProps;
export type AnyTemplateProps = TemplateContext & TemplateRuntimeProps;

export interface NotFoundTemplateProps extends TemplateRuntimeProps {
  slug: string;
}

export interface TemplateContextOptions {
  url?: string;
  path?: string;
}

export function createTemplateContext(route: WpResolvedRoute, options: TemplateContextOptions = {}): TemplateContext {
  const base = {
    url: options.url ?? '',
    path: options.path ?? '',
    cacheKey: createCacheKey(route, options),
  };

  switch (route.kind) {
    case 'postsArchive':
    case 'postTypeArchive':
      return {
        ...base,
        kind: route.kind,
        route,
        title: route.title,
        content: '',
        excerpt: '',
        acf: {},
        slug: route.slug,
        postType: route.postType,
        items: route.items,
        page: route.page,
        perPage: route.perPage,
        total: route.total,
        totalPages: route.totalPages,
      };
    case 'search':
      return {
        ...base,
        kind: route.kind,
        route,
        title: route.title,
        content: '',
        excerpt: '',
        acf: {},
        slug: route.slug,
        postType: route.postType,
        items: route.items,
        page: route.page,
        perPage: route.perPage,
        total: route.total,
        totalPages: route.totalPages,
        search: route.search,
      };
    case 'taxonomyArchive':
      return {
        ...base,
        kind: route.kind,
        route,
        title: route.title,
        content: '',
        excerpt: '',
        acf: {},
        slug: route.slug,
        postType: route.postType,
        items: route.items,
        page: route.page,
        perPage: route.perPage,
        total: route.total,
        totalPages: route.totalPages,
        taxonomy: route.taxonomy,
        taxonomyRestBase: route.taxonomyRestBase,
        termId: route.termId,
        termName: route.termName,
      };
    case 'page':
      return {
        ...base,
        kind: route.kind,
        route,
        item: route.item,
        title: route.item.title.rendered,
        content: route.item.content.rendered,
        excerpt: route.item.excerpt?.rendered ?? '',
        acf: route.item.acf ?? {},
        slug: route.slug,
        postType: route.postType,
        items: [],
        page: 1,
        perPage: 0,
        total: 0,
        totalPages: 0,
        isFrontPage: route.isFrontPage ?? false,
      };
    case 'single':
      return {
        ...base,
        kind: route.kind,
        route,
        item: route.item,
        title: route.item.title.rendered,
        content: route.item.content.rendered,
        excerpt: route.item.excerpt?.rendered ?? '',
        acf: route.item.acf ?? {},
        slug: route.slug,
        postType: route.postType,
        items: [],
        page: 1,
        perPage: 0,
        total: 0,
        totalPages: 0,
      };
  }
}

function createCacheKey(route: WpResolvedRoute, options: TemplateContextOptions) {
  return [
    route.kind,
    'postType' in route ? route.postType : '',
    route.slug,
    'item' in route ? route.item.id : '',
    'taxonomy' in route ? route.taxonomy : '',
    'termId' in route ? route.termId : '',
    'page' in route ? route.page : '',
    options.path ?? '',
  ].join(':');
}

export function templateCandidates(route: WpResolvedRoute): string[] {
  if (route.kind === 'search') {
    return ['search.astro', 'posts/archive.astro'];
  }

  if (route.kind === 'taxonomyArchive') {
    return [
      `taxonomies/${route.taxonomy}-${route.slug}.astro`,
      `taxonomies/${route.taxonomy}.astro`,
      'taxonomies/taxonomy-[taxonomy].astro',
      'posts/archive.astro',
    ];
  }

  if (route.kind === 'postsArchive') {
    return ['posts/archive.astro'];
  }

  if (route.kind === 'postTypeArchive') {
    return [
      `post-types/${route.postType}/archive.astro`,
      'posts/archive.astro',
    ];
  }

  if (route.kind === 'page') {
    return [
      ...(route.isFrontPage ? ['pages/front-page.astro'] : []),
      `pages/page-${route.slug}.astro`,
      'pages/default.astro',
    ];
  }

  return [
    `post-types/${route.postType}/single-${route.slug}.astro`,
    `post-types/${route.postType}/single.astro`,
    ...(route.postType === 'post' ? [] : ['posts/single.astro']),
    `posts/single-${route.slug}.astro`,
    'posts/single.astro',
  ];
}
