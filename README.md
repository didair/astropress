# AstroPress

AstroPress is an Astro-first WordPress development framework.

One entrypoint for everything you need, no fuzz and no magic.

## Requirements

- Node.js 20+
- PHP 8.3+
- Composer
- a MySQL or MariaDB server

## Get started

```bash
mkdir my-site
cd my-site
npm init -y
npx astropress init
cp .env.example .env
```

`astropress init` creates the starter files, adds the needed package dependencies, and runs install.

Edit `.env` with your database credentials, run `npm run dev`, wait for the initial configuration and then open:

```txt
http://localhost:3000
```

If the database is empty, go to `/wp-admin/` and complete the WordPress installer.

## Commands

```bash
npm run dev      # Start the local AstroPress runtime
npm run doctor   # Check PHP, Composer, WordPress, config, and environment
npm run types    # Generate WordPress-derived TypeScript types
npm run check    # Run Astro type checking
npx astropress composer install  # Run Composer in the project
npx astropress wp plugin list    # Run WP-CLI when installed
```

For internal runtime diagnostics:

```bash
npm run dev -- --verbose
```

## Folder structure

```txt
my-site/
  astro.config.mjs
  astropress.config.ts
  composer.json
  .env

  .astropress/
    types.d.ts             # generated WordPress types

  src/
    live.config.ts
    templates/             # optional template overrides

  wordpress/
    public/              # Composer-installed WordPress core
    content/
      mu-plugins/        # AstroPress bridge is generated here
      themes/            # AstroPress placeholder theme is generated here
      plugins/
      uploads/
```

## Templates

AstroPress ships default templates from the package. Create files in `src/templates` only when you want to override them.

Examples:

```txt
src/templates/pages/front-page.astro
src/templates/layouts/Base.astro
src/templates/pages/page-about.astro
src/templates/posts/single.astro
src/templates/posts/archive.astro
src/templates/taxonomies/category.astro
src/templates/search.astro
src/templates/404.astro
```

Template props are typed by importing the matching generated type as Astro's `Props` type:

```astro
---
import type { WpPageTemplateProps as Props } from 'wp-types';

const { title, content, item, route, Layout } = Astro.props;
---

<Layout {...Astro.props}>
  <h1>{title}</h1>
  <div set:html={content} />
</Layout>
```

Available generated types include `WpPageTemplateProps`, `WpSingleTemplateProps`,
`WpArchiveTemplateProps`, `WpSearchTemplateProps`, and `WpTaxonomyTemplateProps`.
Custom post types and taxonomies can be narrowed with a generic, such as
`WpSingleTemplateProps<'product'>`.

`npm run types` writes these project-specific types to `.astropress/types.d.ts`.
AstroPress exposes that generated file through the `wp-types` alias.

## WordPress data

AstroPress uses Astro Live Collections for WordPress data:

```ts
import { getLiveCollection, getLiveEntry } from 'astro:content';

const route = await getLiveEntry('routes', { path: '/' });
const posts = await getLiveCollection('posts', { page: 1, perPage: 10 });
const menu = await getLiveEntry('menus', { location: 'primary' });
```

After `npm run dev` or `npm run check`, collection names and filters should have TypeScript completion.

## Menus

Register WordPress menu positions in `astropress.config.ts`:

```ts
export default defineConfig({
  wordpress: {
    menus: {
      primary: 'Primary menu',
      footer: 'Footer menu',
    },
  },
});
```

Then assign menus to those locations in WordPress admin and fetch them by location:

```ts
import { getMenuByLocation } from 'astropress/wordpress';

const menu = await getMenuByLocation('primary');
```

## WordPress hooks in Astro

Astro templates can ask the internal WordPress runtime to render real WordPress actions and filters during SSR:

```astro
---
import { createHooks } from 'astropress/wordpress';

const hooks = createHooks(Astro.props);
const head = await hooks.action('wp_head');
const content = await hooks.filter('the_content', Astro.props.content);
---

<Fragment set:html={head.rendered} />
<article set:html={content.value} />
```

## Blocks and plugin assets

AstroPress discovers block metadata from `src/blocks/**/block.json` and bundles WordPress-side JS/TS and optional CSS.

```txt
src/blocks/hero/block.json
src/blocks/hero/edit.tsx
src/blocks/hero/style.css # optional
```
