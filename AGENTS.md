# AstroPress End Vision

## North Star

AstroPress should become the fastest, most predictable way to build real WordPress sites with Astro and modern JavaScript while keeping WordPress excellent at what it already does: content modeling, editing workflows, authentication, media, plugins, Composer-based PHP dependencies, and publishing.

The important distinction: AstroPress should not primarily be an Astro app that connects to a separate WordPress instance. In local development, the AstroPress project should **be the WordPress instance**. `npm run dev` should start WordPress/PHP and Astro together, expose one local site URL, and make admin, REST, media, previews, and Astro-rendered frontend routes work in unison.

The end state is a unified development experience where a developer can run one command and get:

- a local WordPress site installed from Composer,
- an Astro application using Astro's router and rendering model,
- hot module reloading,
- server-side rendering, static output, or hybrid output depending on the project,
- typed access to WordPress data,
- first-class Composer support with a pinned WordPress core version,
- bring-your-own database configuration that follows WordPress defaults,
- first-class block and plugin bundling,
- WordPress-like template conventions expressed as files and folders,
- framework-agnostic component authoring through Astro integrations and islands,
- and production-ready build outputs for both the Astro frontend and WordPress-side assets.

Astro should be the required app foundation. AstroPress should not try to become a universal router/runtime abstraction over React, Vue, Svelte, or vanilla Vite apps. Instead, Astro provides the routing, rendering, bundling integration, server runtime, and multi-framework component model. Developers can still write React, Vue, Svelte, Solid, or vanilla components inside an Astro project when useful.

## Product Promise

Developing a headless WordPress site should feel as cohesive as developing a classic WordPress theme with Twig-style template organization, but with Astro, TypeScript, Vite, SSR, islands, and modern build tooling.

Today, headless WordPress work often means stitching together separate concerns:

- WordPress local environment setup,
- Composer dependencies,
- GraphQL or REST API setup,
- frontend routing and previews,
- editor preview behavior,
- block compilation,
- plugin asset compilation,
- PHP/JS boundaries,
- environment variables,
- generated TypeScript types,
- deployment artifacts,
- and framework-specific conventions.

AstroPress should make these feel like one system.

The ideal mental model:

```bash
npm create astropress my-site
cd my-site
npm run dev
```

From there, the developer should have a project-owned WordPress install, Astro, generated types, Composer dependencies, preview support, block/plugin bundling, and sensible defaults working together. WordPress core should be installed from Composer and pinned in `composer.json`; it should not be committed to git as project source.

## Target Developer Experience

### One local command

`astropress dev` should orchestrate the development stack:

- install/validate WordPress from Composer,
- start the local PHP/WordPress runtime,
- install or validate Composer dependencies,
- start the Astro dev server,
- proxy API, media, preview, and admin routes where needed,
- watch WordPress-side entrypoints,
- generate or refresh types,
- expose the one local site URL prominently and keep internal PHP/Astro ports as verbose diagnostics,
- and fail with actionable errors when dependencies are missing.

The developer should not need to understand every moving part before building a page.

### Astro-native by design

Astro should own the page/router layer. AstroPress should extend Astro with WordPress-aware conventions rather than replacing Astro's routing model.

AstroPress should use Astro for:

- file-based routes,
- dynamic routes,
- SSR endpoints,
- static generation,
- hybrid rendering,
- middleware where needed,
- component islands,
- framework integrations,
- image/media workflows where appropriate,
- and deployment adapters.

AstroPress should add the WordPress layer:

- route metadata from WordPress,
- preview handling,
- template hierarchy resolution,
- Astro Live Collection loaders for WordPress data,
- typed data helpers,
- WordPress-aware redirects and slugs,
- block/plugin asset builds,
- Composer/PHP dependency awareness,
- and development orchestration.

### Tech-agnostic components through Astro

The project should remain tech agnostic at the component level, not at the app runtime level.

Developers should be able to use:

- `.astro` components for most templates,
- React islands when needed,
- Vue islands when needed,
- Svelte/Solid islands when needed,
- vanilla TypeScript modules,
- CSS modules, PostCSS, Tailwind, or plain CSS,
- and server-only TypeScript utilities.

The routing and rendering foundation should remain Astro so AstroPress can provide one coherent WordPress development model.

### WordPress as a first-class development dependency

AstroPress should treat WordPress as part of the app, not as an external afterthought.

The tool should support:

- bootstrapping local WordPress,
- connecting to existing local or remote WordPress instances,
- managing required plugins during development,
- installing optional plugin bundles,
- syncing basic settings,
- verifying permalink/API/auth configuration,
- surfacing WordPress health checks in the JS terminal,
- and creating a predictable boundary between WordPress admin/editor and the Astro frontend.

The preferred local path should aim for a single runtime experience where possible: one project, one command, and one coherent process boundary for WordPress + Astro development instead of requiring separate application containers or disconnected services. AstroPress should expose one public local origin where WordPress admin, REST routes, media, previews, and Astro frontend routes all work together. Internal WordPress/PHP and Astro listeners may still exist on loopback ports, but they should be implementation details with auto-selected ports by default, not URLs developers are expected to use. The database should be bring-your-own by default, matching WordPress expectations: AstroPress configures and validates database settings, but does not need to own or start MySQL/MariaDB.

If a team chooses to run AstroPress inside Docker or another containerized environment, it should be painless, but Docker should not be the assumed architecture or the center of the plan.

AstroPress can later support “bring your own WordPress” for teams that already use Local, DDEV, Lando, wp-env, Docker, a custom PHP runtime, or a remote staging CMS, but that is secondary to the main innovation: the AstroPress project itself is the local WordPress instance.

### Composer first-class support

Composer should be treated as a normal part of the AstroPress project, not as an escape hatch. WordPress core should be installed and versioned through Composer by default so teams can pin, upgrade, and audit the exact WordPress version used by a project.

AstroPress should support:

- detecting `composer.json`,
- requiring WordPress core to be declared in `composer.json` by default,
- running or validating `composer install`,
- installing WordPress core into a generated/vendor-managed path,
- keeping WordPress core out of git,
- managing WordPress PHP dependencies,
- supporting WordPress plugins installed through Composer,
- supporting mu-plugins and project PHP libraries,
- validating PHP autoload paths,
- exposing Composer/plugin health in `astropress doctor`,
- and making Composer-based projects work with the same `astropress dev` and `astropress build` flows.

The tool should not replace Composer. It should coordinate with Composer and make PHP dependency state visible from the AstroPress developer experience. The repository should commit `composer.json` and `composer.lock`, not the downloaded WordPress core files.

### First-class plugin and block bundling

AstroPress should support WordPress-side JavaScript as a native part of the project.

It should be possible to define WordPress plugin, block, editor, and frontend entries in one config and have the system produce valid WordPress assets.

Goals:

- compile block editor scripts,
- compile frontend block scripts,
- compile editor styles and frontend styles,
- emit WordPress asset metadata,
- support `block.json`,
- support multiple blocks,
- support plugin entrypoints,
- support shared packages between Astro frontend and WordPress assets,
- externalize WordPress packages such as `@wordpress/blocks` when appropriate,
- and make the PHP enqueue boundary simple and typed where possible.

The developer should be able to write TypeScript for WordPress assets without manually wiring every build artifact.

### TypeScript everywhere

Types should be a central feature, not an afterthought.

AstroPress should generate and maintain types for:

- WordPress REST API responses,
- WPGraphQL schema when available,
- custom post types,
- taxonomies,
- ACF or block field schemas when available,
- menus,
- media,
- users/auth-sensitive shapes where appropriate,
- block attributes,
- plugin configuration,
- Composer/plugin capability metadata where useful,
- environment variables,
- and AstroPress project configuration.

Generated types should be deterministic, checked into the project when useful, and refreshable with one command:

```bash
astropress types
```

The system should support both REST-first and GraphQL-first projects. WPGraphQL can be a preferred rich-schema path, but REST must remain supported because it is native to WordPress.

### Preview and editorial workflows

The end experience must respect the WordPress editor.

AstroPress should support:

- previewing drafts and revisions in Astro routes,
- authenticated preview links,
- editor-to-frontend preview routing,
- live preview where possible,
- block editor asset builds,
- mapping WordPress URLs to Astro routes,
- and graceful fallbacks for static builds.

Headless should not mean “the editor experience got worse.”

### Deployment-aware outputs

The project should produce explicit artifacts for:

- Astro frontend deployment,
- WordPress plugin/theme deployment when needed,
- block/plugin build artifacts,
- Composer dependency expectations,
- generated type artifacts,
- and environment metadata.

The tool should not assume one hosting provider. It should support static, server-rendered, and hybrid Astro outputs depending on project needs.

## Template System Vision

AstroPress should provide a predefined folder structure that feels familiar to WordPress and Twig developers while staying native to Astro.

The goal is not to recreate PHP template loading. The goal is to map WordPress content concepts to predictable Astro files.

### Proposed folder structure

```txt
src/
  pages/
    [...slug].astro              # Final catch-all route backed by WordPress route resolution
    preview/[token].astro        # Draft/revision preview route

  templates/
    layouts/
      Base.astro
      Post.astro
      Archive.astro

    partials/
      Header.astro
      Footer.astro
      Seo.astro
      Pagination.astro

    pages/
      default.astro              # Default WordPress page template
      front-page.astro           # Homepage
      page-about.astro           # Slug-specific page template
      page-[slug].astro          # Dynamic page template pattern

    posts/
      single.astro               # Default post template
      single-[slug].astro        # Slug-specific post template
      archive.astro              # Blog index/archive template

    post-types/
      product/
        single.astro             # Single product template
        archive.astro            # Product archive template
        single-[slug].astro      # Slug-specific product template
      event/
        single.astro
        archive.astro

    taxonomies/
      category.astro             # Category archive template
      tag.astro                  # Tag archive template
      product_category.astro     # Custom taxonomy template
      taxonomy-[taxonomy].astro  # Generic taxonomy fallback

    search.astro
    404.astro

  wordpress/
    client.ts
    routes.ts
    templates.ts                 # Template hierarchy resolver
    preview.ts
    types.ts

  blocks/
    hero/
      block.json
      edit.tsx
      save.tsx
      style.css

  wp-plugin/
    plugin.php
    includes/
    assets/
```

### Template hierarchy

AstroPress should resolve templates in a predictable order inspired by the WordPress template hierarchy.

Examples:

For a normal page:

1. `templates/pages/page-{slug}.astro`
2. `templates/pages/page-[slug].astro`
3. `templates/pages/default.astro`

For a post:

1. `templates/posts/single-{slug}.astro`
2. `templates/posts/single.astro`

For a custom post type single:

1. `templates/post-types/{postType}/single-{slug}.astro`
2. `templates/post-types/{postType}/single.astro`
3. `templates/posts/single.astro`

For a custom post type archive:

1. `templates/post-types/{postType}/archive.astro`
2. `templates/posts/archive.astro`

For a taxonomy archive:

1. `templates/taxonomies/{taxonomy}-{term}.astro`
2. `templates/taxonomies/{taxonomy}.astro`
3. `templates/taxonomies/taxonomy-[taxonomy].astro`
4. `templates/posts/archive.astro`

This should be implemented as an Astro-native resolver used by a small number of routes, not by generating a route file for every WordPress object.

## Architecture Principles

### Astro owns routing and rendering

The core package should provide:

- CLI commands,
- project config loading,
- Astro integration setup,
- WordPress connection management,
- Composer dependency checks,
- database configuration checks,
- dev process orchestration,
- type generation pipeline,
- block/plugin bundling pipeline,
- template hierarchy resolution,
- logging and diagnostics,
- and shared runtime contracts.

Astro should provide:

- route execution,
- SSR/static/hybrid rendering,
- framework integrations,
- islands,
- middleware,
- endpoint handling,
- and deployment adapters.

### Progressive adoption

AstroPress should work for multiple project shapes:

1. A new greenfield Astro + WordPress site.
2. An Astro frontend connecting to an existing WordPress instance.
3. A WordPress plugin/block package inside an existing site.
4. A hybrid project that uses WordPress-rendered pages plus Astro-powered islands or sections.
5. A migration path from a classic WordPress theme or Twig setup to an Astro template structure.

The first implementation should focus on the greenfield Astro path, but the architecture should not close the door on the other modes.

### Configuration should be explicit but small

The project should have one main config file:

```ts
// astropress.config.ts
import { defineConfig } from "astropress";

export default defineConfig({
  database: {
    driver: "mysql",
    host: process.env.WP_DB_HOST ?? "127.0.0.1",
    port: Number(process.env.WP_DB_PORT ?? 3306),
    name: process.env.WP_DB_NAME ?? "astropress",
    user: process.env.WP_DB_USER ?? "root",
    password: process.env.WP_DB_PASSWORD ?? "",
    tablePrefix: process.env.WP_DB_TABLE_PREFIX ?? "wp_",
  },
  wordpress: {
    mode: "local",
    url: "http://localhost:3000",
  },
  composer: {
    install: true,
  },
  templates: {
    directory: "src/templates",
  },
  types: {
    source: "rest",
  },
  blocks: {
    entries: ["src/blocks/**/block.json"],
  },
  plugins: {
    entries: ["src/wp-plugin/plugin.php"],
  },
});
```

Defaults should cover the common case. Advanced teams should still be able to override ports, proxies, generated paths, PHP runtime settings, Composer behavior, schema sources, build entries, and deployment output.

### WordPress compatibility should be deliberate

The project should integrate with WordPress conventions rather than fight them.

Important compatibility areas:

- `block.json`,
- script/style asset metadata,
- WordPress dependency handles,
- PHP enqueue patterns,
- Composer dependencies,
- PHP autoloading,
- REST API authentication,
- nonce handling,
- editor preview URLs,
- permalink behavior,
- media URLs,
- multisite awareness as a later-stage concern,
- and classic plugin/theme deployment constraints.

### Modern JavaScript should remain modern

Developers should get the benefits they expect from a modern frontend toolchain:

- TypeScript,
- ESM,
- Astro,
- Vite-powered dev speed,
- HMR,
- optimized production builds,
- path aliases,
- environment variable validation,
- lint/test integration hooks,
- code splitting,
- CSS modules/postcss/tailwind compatibility,
- and Astro-native rendering patterns.

WordPress integration should not force the frontend into outdated patterns.

## Major Subsystems

### `astropress` CLI

The CLI is the primary interface.

Planned commands:

- `astropress dev` — run the full Astro + WordPress development environment.
- `astropress build` — build Astro and WordPress-side assets.
- `astropress preview` — preview the production build.
- `astropress types` — generate TypeScript types from WordPress sources.
- `astropress composer` — run or proxy selected Composer workflows where useful.
- `astropress wp` — proxy selected WP-CLI operations or provide a consistent wrapper.
- `astropress doctor` — validate local setup, WordPress connectivity, Composer, plugins, schemas, routes, templates, and config.
- `astropress init` — add AstroPress to an existing Astro project.

### WordPress bridge

The bridge is responsible for communicating with WordPress and making it observable from the Astro side.

Responsibilities:

- connection discovery,
- environment validation,
- Composer/plugin availability checks,
- REST/WPGraphQL introspection,
- auth and nonce strategy,
- preview token strategy,
- route mapping metadata,
- media URL normalization,
- and optional local WordPress lifecycle management.

### Astro integration

AstroPress should ship an Astro integration that wires the project together.

Responsibilities:

- install AstroPress runtime helpers,
- expose virtual modules when useful,
- connect template resolution to Astro routes,
- add dev middleware/proxy behavior,
- add preview route helpers,
- expose typed WordPress clients,
- coordinate block/plugin watch mode,
- and integrate diagnostics with Astro dev output.

### Dev server and proxy layer

The dev server should make Astro and WordPress feel like one app.

Responsibilities:

- proxy WordPress API requests,
- proxy media requests when needed,
- map preview URLs,
- avoid CORS pain by default,
- expose WordPress admin links,
- coordinate Astro dev lifecycle,
- and show unified logs.

### Type generation pipeline

The type system should be source-driven and pluggable.

Potential sources:

- WordPress REST API index,
- WPGraphQL schema introspection,
- `block.json`,
- ACF field groups,
- local schema declaration files,
- Composer-installed plugin metadata where useful,
- custom plugin-provided schema endpoints.

Outputs:

- generated `.d.ts` or `.ts` files,
- runtime-safe clients where useful,
- schema snapshots,
- and diagnostics when WordPress data is too dynamic to type confidently.

### Block and plugin bundler

The WordPress bundler should be Vite-powered where possible and WordPress-aware where necessary.

Responsibilities:

- discover entries,
- compile TypeScript,
- compile styles,
- emit asset manifests,
- externalize WordPress globals/packages,
- support block metadata,
- support plugin metadata,
- emit PHP-readable manifests,
- and support watch mode during development.

### Runtime model

The preferred development model should avoid making developers run separate application containers just to work on a site.

AstroPress should aim for:

- one project command,
- one coherent runtime story,
- local PHP/WordPress and Astro coordination,
- Composer-aware setup,
- simple environment variables,
- bring-your-own MySQL/MariaDB by default,
- and a path that works on a normal developer machine.

Containerized development should remain possible and pleasant for teams that want it, but it should not be required for the default mental model or core architecture.

## Initial Project Shape

An eventual generated project could look like:

```txt
my-site/
  astro.config.mjs
  astropress.config.ts
  composer.json
  package.json
  src/
    pages/
      [...slug].astro
      preview/[token].astro
    templates/
      layouts/
      partials/
      pages/
      posts/
      post-types/
      taxonomies/
      search.astro
      404.astro
    components/
    wordpress/
      client.ts
      routes.ts
      templates.ts
      preview.ts
    blocks/
      hero/
        block.json
        edit.tsx
        save.tsx
        style.css
    wp-plugin/
      plugin.php
      includes/
  .astropress/
    types/
    cache/
  wordpress/
    public/                  # generated Composer-installed WordPress docroot, ignored by git
    content/
      plugins/
      mu-plugins/
      uploads/
```

This structure is only a direction, not a final contract. The important point is that Astro routes, WordPress template conventions, frontend components, WordPress integration code, block code, plugin code, Composer dependencies, and generated types have obvious homes.


## Codebase Integration and Updates

AstroPress should feel like a real library inside the project, not a one-time scaffold that users are afraid to update.

The preferred distribution model should separate stable package-owned behavior from user-owned project files:

- npm package: CLI, Astro integration, template resolver, type generation, dev proxy, and block/plugin bundler.
- Composer packages: pinned WordPress core, PHP bridge/mu-plugin, and optional WordPress plugins.
- project files: `astropress.config.ts`, `astro.config.mjs`, `composer.json`, templates, components, blocks, and project-specific PHP.

Generated projects can include a meaningful folder structure and starter files, but long-lived behavior should live in versioned npm/Composer packages wherever possible. This lets AstroPress ship fixes and new capabilities without overwriting a user's templates.

A future `astropress upgrade` command should:

- report available npm package updates,
- report available Composer package updates,
- explain required config changes,
- provide codemods only for safe mechanical migrations,
- never overwrite user templates without a visible diff,
- and keep WordPress core upgrades explicit through `composer.json` and `composer.lock`.

This creates a clean boundary: users own their site; AstroPress owns the reusable development system.

## Roadmap

### Phase 1 — Astro + local WordPress runtime prototype

Focus: prove the groundbreaking loop: the AstroPress project is the local WordPress instance and Astro renders the frontend.

- Create the CLI skeleton.
- Define `astropress.config.ts`.
- Add the Astro integration.
- Add a default `composer.json` that installs a pinned WordPress core version.
- Install WordPress core into a generated docroot that is ignored by git.
- Start a local PHP/WordPress runtime from `astropress dev`.
- Start Astro from `astropress dev`.
- Expose one unified local origin for WordPress admin, REST, media, previews, and Astro-rendered frontend pages.
- Own the dev proxy in AstroPress rather than depending solely on Vite's proxy config, because the proxy is the runtime boundary between WordPress and Astro.
- Add the catch-all WordPress route.
- Add the template hierarchy resolver.
- Proxy REST API and media internally.
- Generate basic REST-derived types.
- Provide typed content fetch helpers.
- Add `astropress doctor`.
- Document local setup assumptions.

### Phase 2 — Composer and local runtime

Focus: make PHP/WordPress dependencies feel native and make the project itself run WordPress locally.

- Detect and validate Composer.
- Harden Composer install/update workflows.
- Validate pinned WordPress versions from `composer.json` and `composer.lock`.
- Validate that generated WordPress core files stay out of git.
- Harden local PHP/WordPress runtime startup.
- Harden unified local origin routing for admin, REST, media, previews, and Astro-rendered frontend routes.
- Keep MySQL/MariaDB bring-your-own by default.
- Consider SQLite as an optional future local convenience, not the default WordPress-compatible path.
- Support Composer-installed plugins and mu-plugins.
- Add Composer status to `astropress doctor`.
- Define the preferred single-runtime local development path.
- Add WordPress health checks.
- Add plugin installation/activation checks.
- Add local reset/seed workflows where practical.
- Improve preview URL handling.

### Phase 3 — Blocks and plugins

Focus: WordPress-side modern bundling.

- Add block entry discovery.
- Compile editor and frontend block assets.
- Emit asset metadata.
- Support `block.json`.
- Add plugin entry bundling.
- Add PHP manifest helpers.
- Add watch mode for WordPress-side assets.

### Phase 4 — Rich types

Focus: make TypeScript a primary reason to use AstroPress.

- Add WPGraphQL schema support.
- Add custom post type and taxonomy type generation.
- Add block attribute types.
- Add ACF-aware generation if ACF is present.
- Add generated route helpers.
- Add template context types.
- Add schema snapshots and diff diagnostics.

### Phase 5 — Template system maturity

Focus: make Astro feel like a natural WordPress theme layer.

- Finalize template hierarchy rules.
- Add typed template context objects.
- Add route/template debug output.
- Add examples for custom post types.
- Add examples for taxonomies.
- Add examples for search and 404 pages.
- Add migration guidance from Twig/classic theme structures.

### Phase 6 — Production workflows

Focus: deployment confidence.

- Define production artifact contracts.
- Add Astro frontend builds.
- Add plugin-only and combined builds.
- Add Composer dependency guidance for deploys.
- Add deploy guides for common hosts.
- Add CI examples.
- Add preview/staging environment guidance.

## Open Technical Decisions

These decisions should be resolved during technical planning:

1. What is the preferred single-runtime local development path for WordPress + Astro?
2. How should AstroPress generate or manage `wp-config.php` from bring-your-own database settings?
3. Should SQLite be offered as an optional convenience without making it the default?
4. How should AstroPress install WordPress core through Composer while keeping the generated docroot out of git?
5. How should AstroPress locate and manage a local PHP/WordPress runtime without centering the plan on Docker?
6. How should Composer-installed plugins and project PHP libraries be discovered and validated?
7. Should WPGraphQL be optional, recommended, or part of the default template?
8. How much PHP should AstroPress generate versus document?
9. Should block/plugin bundling live in the core package or a dedicated package?
10. What is the minimal stable Astro integration API?
11. How should authenticated previews work across static, SSR, and hybrid Astro frontends?
12. How should generated types be cached, committed, and invalidated?
13. How should AstroPress support existing WordPress projects without forcing a repo restructure?
14. What deployment artifact shape best supports real WordPress hosting constraints?
15. How should the project test against real WordPress versions, PHP versions, Composer setups, database setups, and plugin combinations?

## Non-goals for the first implementation

The first implementation should not try to solve every WordPress workflow at once.

Initial non-goals:

- full multisite support,
- universal hosting automation,
- replacing Composer,
- replacing WP-CLI,
- replacing the WordPress admin,
- replacing the WordPress plugin ecosystem,
- supporting non-Astro app runtimes,
- making Docker the default architecture,
- and building a complete CMS schema layer independent of WordPress.

These can become future capabilities, but the first milestone should remain narrow enough to ship.

## Success Criteria

AstroPress is successful when:

- a developer can start a new Astro + WordPress project in minutes,
- local development requires one primary command,
- `npm run dev` starts the project-owned WordPress/PHP runtime and Astro together,
- one local URL serves WordPress admin, REST, media, previews, and Astro-rendered frontend pages,
- WordPress core is installed and pinned through Composer instead of committed to git,
- Composer dependencies are visible and validated by the tool,
- the default runtime story does not require separate app containers,
- TypeScript types are generated automatically and are useful in real Astro templates,
- WordPress previews work reliably,
- custom post type pages and archives can be added by creating files in predictable folders,
- block/plugin assets build without custom boilerplate,
- teams can connect to existing WordPress instances,
- and the architecture makes Docker/container usage painless without making it the center of the plan.

The final experience should feel like WordPress gained an Astro-native, modern JavaScript development layer with the familiar template ergonomics of a well-structured theme.
