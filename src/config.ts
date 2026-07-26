import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfigFromFile, loadEnv } from 'vite';

export type WordPressRuntimeMode = 'local' | 'external';
type HookCacheConfig = boolean | {
  enabled?: boolean;
  ttl?: number;
};

export interface AstroPressConfig {
  database?: {
    driver?: 'mysql' | 'mariadb';
    host?: string;
    port?: number;
    name?: string;
    user?: string;
    password?: string;
    tablePrefix?: string;
  };
  wordpress?: {
    mode?: WordPressRuntimeMode;
    url?: string;
    docroot?: string;
    contentDir?: string;
    menus?: Record<string, string>;
    omitDefaultAssets?: boolean;
    requiredPlugins?: string[];
    pluginPresets?: string[];
    routes?: {
      wordpress?: string[];
    };
    hooks?: {
      cache?: HookCacheConfig;
    };
  };
  composer?: {
    install?: boolean;
    wordpressPackage?: string;
  };
  templates?: {
    directory?: string;
  };
  types?: {
    output?: string;
  };
  dev?: {
    proxyHost?: string;
    proxyPort?: number;
    phpHost?: string;
    phpPort?: number;
    astroHost?: string;
    astroPort?: number;
  };
  blocks?: {
    entries?: string[];
    outDir?: string;
  };
  plugins?: {
    entries?: string[];
  };
}

export interface LoadedAstroPressConfig {
  root: string;
  configFile?: string;
  database: {
    driver: 'mysql' | 'mariadb';
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    tablePrefix: string;
  };
  wordpress: {
    mode: WordPressRuntimeMode;
    url: string;
    docroot: string;
    contentDir: string;
    menus: Record<string, string>;
    omitDefaultAssets: boolean;
    requiredPlugins: string[];
    pluginPresets: string[];
    routes: {
      wordpress: string[];
    };
    hooks: {
      cache: {
        enabled: boolean;
        ttl: number;
      };
    };
  };
  composer: {
    install: boolean;
    wordpressPackage: string;
  };
  templates: {
    directory: string;
  };
  types: {
    output: string;
  };
  dev: {
    proxyHost: string;
    proxyPort: number;
    phpHost: string;
    phpPort: number;
    astroHost: string;
    astroPort: number;
  };
  blocks: {
    entries: string[];
    outDir: string;
  };
  plugins: {
    entries: string[];
  };
}

const configFiles = [
  'astropress.config.ts',
  'astropress.config.mts',
  'astropress.config.js',
  'astropress.config.mjs',
];

export function defineConfig(config: AstroPressConfig): AstroPressConfig {
  return config;
}

export async function loadAstroPressConfig(root = process.cwd()): Promise<LoadedAstroPressConfig> {
  loadDotEnv(root);

  const configFile = configFiles
    .map((file) => resolve(root, file))
    .find((file) => existsSync(file));

  let userConfig: AstroPressConfig = {};

  if (configFile) {
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      configFile,
      root,
      undefined,
      undefined,
      'runner',
    );
    userConfig = (loaded?.config ?? {}) as AstroPressConfig;
  }

  return {
    root,
    configFile,
    database: {
      driver: userConfig.database?.driver ?? env('WP_DB_DRIVER', 'mysql') as 'mysql' | 'mariadb',
      host: userConfig.database?.host ?? env('WP_DB_HOST', '127.0.0.1'),
      port: userConfig.database?.port ?? Number(env('WP_DB_PORT', '3306')),
      name: userConfig.database?.name ?? env('WP_DB_NAME', 'astropress'),
      user: userConfig.database?.user ?? env('WP_DB_USER', 'root'),
      password: userConfig.database?.password ?? env('WP_DB_PASSWORD', ''),
      tablePrefix: userConfig.database?.tablePrefix ?? env('WP_DB_TABLE_PREFIX', 'wp_'),
    },
    wordpress: {
      mode: userConfig.wordpress?.mode ?? 'local',
      url: userConfig.wordpress?.url ?? 'http://localhost:3000',
      docroot: userConfig.wordpress?.docroot ?? 'wordpress/public',
      contentDir: userConfig.wordpress?.contentDir ?? 'wordpress/content',
      menus: userConfig.wordpress?.menus ?? {},
      omitDefaultAssets: userConfig.wordpress?.omitDefaultAssets ?? true,
      requiredPlugins: userConfig.wordpress?.requiredPlugins ?? [],
      pluginPresets: userConfig.wordpress?.pluginPresets ?? [],
      routes: {
        wordpress: userConfig.wordpress?.routes?.wordpress ?? ['/my-account', '/cart', '/checkout'],
      },
      hooks: {
        cache: normalizeHookCache(userConfig.wordpress?.hooks?.cache),
      },
    },
    composer: {
      install: userConfig.composer?.install ?? true,
      wordpressPackage: userConfig.composer?.wordpressPackage ?? 'johnpbloch/wordpress',
    },
    templates: {
      directory: userConfig.templates?.directory ?? 'src/templates',
    },
    types: {
      output: userConfig.types?.output ?? '.astropress/types.d.ts',
    },
    dev: {
      proxyHost: userConfig.dev?.proxyHost ?? env('ASTROPRESS_PROXY_HOST', ''),
      proxyPort: userConfig.dev?.proxyPort ?? envPort('ASTROPRESS_PROXY_PORT'),
      phpHost: userConfig.dev?.phpHost ?? env('ASTROPRESS_PHP_HOST', '127.0.0.1'),
      phpPort: userConfig.dev?.phpPort ?? envPort('ASTROPRESS_PHP_PORT'),
      astroHost: userConfig.dev?.astroHost ?? env('ASTROPRESS_ASTRO_HOST', '127.0.0.1'),
      astroPort: userConfig.dev?.astroPort ?? envPort('ASTROPRESS_ASTRO_PORT'),
    },
    blocks: {
      entries: userConfig.blocks?.entries ?? ['src/blocks/**/block.json'],
      outDir: userConfig.blocks?.outDir ?? 'wordpress/content/astropress-assets',
    },
    plugins: {
      entries: userConfig.plugins?.entries ?? [],
    },
  };
}

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function envPort(name: string): number {
  const value = process.env[name];

  if (!value || value === 'auto') {
    return 0;
  }

  return Number(value);
}

function loadDotEnv(root: string) {
  const values = loadEnv(process.env.NODE_ENV ?? 'development', root, '');

  for (const [key, value] of Object.entries(values)) {
    process.env[key] ??= value;
  }
}

function normalizeHookCache(cache: HookCacheConfig | undefined) {
  if (cache === false) {
    return { enabled: false, ttl: 0 };
  }

  if (cache === true || cache === undefined) {
    return { enabled: true, ttl: 300 };
  }

  return {
    enabled: cache.enabled ?? true,
    ttl: cache.ttl ?? 300,
  };
}
