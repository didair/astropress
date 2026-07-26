import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

export interface AstroPressAstroOptions {
  configFile?: string;
}

export default function astropress(_options: AstroPressAstroOptions = {}): AstroIntegration {
  return {
    name: 'astropress',
    hooks: {
      'astro:config:setup': ({ command, config, injectRoute, addDevToolbarApp, addMiddleware, logger, updateConfig }) => {
        updateConfig({
          vite: {
            resolve: {
              alias: [
                {
                  find: 'wp-types',
                  replacement: fileURLToPath(new URL('./.astropress/types.d.ts', config.root)),
                },
                ...(isSourceIntegration() ? sourceAliases() : []),
              ],
            },
          },
        });

        if (!hasProjectCatchAllRoute(fileURLToPath(config.root))) {
          injectRoute({
            pattern: '/[...slug]',
            entrypoint: getDefaultRouteEntrypoint(),
            prerender: false,
          });
        }

        addMiddleware({
          order: 'pre',
          entrypoint: getRequestContextMiddlewareEntrypoint(),
        });

        if (command === 'dev') {
          addDevToolbarApp({
            id: 'astropress',
            name: 'AstroPress',
            icon: 'sitemap',
            entrypoint: getDevToolbarEntrypoint(),
          });
        }

        logger.info('AstroPress integration loaded.');
      },
    },
  };
}

function hasProjectCatchAllRoute(root: string) {
  return [
    join(root, 'src/pages/[...slug].astro'),
    join(root, 'src/pages/[...slug].ts'),
    join(root, 'src/pages/[...slug].js'),
  ].some((file) => existsSync(file));
}

function getDefaultRouteEntrypoint() {
  const sourceEntrypoint = new URL('../runtime/route.astro', import.meta.url);

  if (existsSync(fileURLToPath(sourceEntrypoint))) {
    return sourceEntrypoint;
  }

  return new URL('../runtime/route.astro', import.meta.url);
}

function getRequestContextMiddlewareEntrypoint() {
  const sourceEntrypoint = new URL('./request-context-middleware.ts', import.meta.url);

  if (existsSync(fileURLToPath(sourceEntrypoint))) {
    return sourceEntrypoint;
  }

  return new URL('./request-context-middleware.js', import.meta.url);
}

function getDevToolbarEntrypoint() {
  const sourceEntrypoint = new URL('./dev-toolbar/astropress-toolbar.ts', import.meta.url);

  if (existsSync(fileURLToPath(sourceEntrypoint))) {
    return sourceEntrypoint;
  }

  return new URL('./dev-toolbar/astropress-toolbar.js', import.meta.url);
}

function isSourceIntegration() {
  return fileURLToPath(import.meta.url).endsWith('/src/astro.ts');
}

function sourceAliases() {
  return [
    alias('astropress/wordpress', './wordpress/index.ts'),
    alias('astropress/woocommerce', './woocommerce.ts'),
    alias('astropress/astro', './astro.ts'),
    alias('astropress', './index.ts'),
  ];
}

function alias(find: string, replacement: string) {
  return {
    find,
    replacement: fileURLToPath(new URL(replacement, import.meta.url)),
  };
}
