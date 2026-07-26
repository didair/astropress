import { defineLiveCollection } from 'astro/content/config';
import { wpMenuLoader, wpPostTypeLoader, wpRouteLoader } from 'astropress/wordpress';
import { wpContentItemSchema, wpMenuSchema, wpResolvedRouteSchema } from 'astropress/wordpress';

export const collections = {
  routes: defineLiveCollection({
    loader: wpRouteLoader(),
    schema: wpResolvedRouteSchema,
  }),
  posts: defineLiveCollection({
    loader: wpPostTypeLoader({ postType: 'post', restBase: 'posts' }),
    schema: wpContentItemSchema,
  }),
  pages: defineLiveCollection({
    loader: wpPostTypeLoader({ postType: 'page', restBase: 'pages' }),
    schema: wpContentItemSchema,
  }),
  menus: defineLiveCollection({
    loader: wpMenuLoader(),
    schema: wpMenuSchema,
  }),
};
