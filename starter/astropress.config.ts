import { defineConfig } from 'astropress';

export default defineConfig({
  database: {
    driver: 'mysql',
    host: process.env.WP_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.WP_DB_PORT ?? 3306),
    name: process.env.WP_DB_NAME ?? 'astropress',
    user: process.env.WP_DB_USER ?? 'root',
    password: process.env.WP_DB_PASSWORD ?? '',
    tablePrefix: process.env.WP_DB_TABLE_PREFIX ?? 'wp_',
  },
  wordpress: {
    mode: 'local',
    url: process.env.WP_URL ?? 'http://localhost:3000',
    docroot: 'wordpress/public',
    contentDir: 'wordpress/content',
    menus: {
      primary: 'Primary menu',
      footer: 'Footer menu',
    },
    routes: {
      wordpress: ['/my-account', '/cart', '/checkout'],
    },
  },
  composer: {
    install: true,
    wordpressPackage: 'johnpbloch/wordpress',
  },
  templates: {
    directory: 'src/templates',
  },
  types: {
    output: '.astropress/types.d.ts',
  },
  blocks: {
    entries: ['src/blocks/**/block.json'],
  },
  plugins: {
    entries: [],
  },
});
