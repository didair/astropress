import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { build, type InlineConfig } from 'vite';
import type { LoadedAstroPressConfig } from '../config.js';

export interface WordPressAssetWatcher {
  stop: () => Promise<void>;
}

interface DiscoveredBlock {
  name: string;
  directory: string;
  metadataFile: string;
  metadata: Record<string, unknown>;
  entries: AssetEntry[];
}

interface AssetEntry {
  id: string;
  source: string;
  kind: 'script' | 'style';
  field?: string;
  handle: string;
  dependencies: string[];
  file?: string;
  css?: string[];
}

interface AssetsManifest {
  version: 1;
  blocks: Array<{
    name: string;
    metadataFile: string;
    directory: string;
    entries: AssetEntry[];
  }>;
  plugins: AssetEntry[];
}

interface DiscoveredAssets {
  blocks: DiscoveredBlock[];
  pluginEntries: AssetEntry[];
  entries: AssetEntry[];
}

const blockAssetFields = [
  ['editorScript', 'script'],
  ['script', 'script'],
  ['viewScript', 'script'],
  ['editorStyle', 'style'],
  ['style', 'style'],
] as const;

export async function buildWordPressAssets(
  config: LoadedAstroPressConfig,
  options: { mode?: 'development' | 'production' } = {},
) {
  const discovered = discoverAssets(config);

  if (discovered.entries.length === 0) {
    return { blocks: [], plugins: [] };
  }

  const outDir = resolve(config.root, config.blocks.outDir);
  const builtEntries = await buildAssetEntries(config, outDir, discovered.entries, options.mode ?? 'production');
  const manifest = writeAssetsManifest(config, outDir, discovered, builtEntries);
  console.log(`✓ WordPress assets built (${discovered.entries.length} entr${discovered.entries.length === 1 ? 'y' : 'ies'})`);
  return manifest;
}

export async function startWordPressAssetWatcher(config: LoadedAstroPressConfig): Promise<WordPressAssetWatcher | null> {
  const discovered = discoverAssets(config);

  if (discovered.entries.length === 0) {
    return null;
  }

  const outDir = resolve(config.root, config.blocks.outDir);
  console.log('Building WordPress block/plugin assets...');
  const builtEntries = await buildAssetEntries(config, outDir, discovered.entries, 'development');
  writeAssetsManifest(config, outDir, discovered, builtEntries);
  console.log(`✓ WordPress assets watching (${discovered.entries.length} entr${discovered.entries.length === 1 ? 'y' : 'ies'})`);

  let fingerprint = assetFingerprint(discovered);
  const watchedFiles = unique([
    ...discovered.blocks.map((block) => block.metadataFile),
    ...discovered.entries.map((entry) => entry.source),
  ]);
  const watchers = watchedFiles.map((file) => watch(file, () => {
    const nextFingerprint = assetFingerprint(discovered);

    if (nextFingerprint === fingerprint) {
      return;
    }

    fingerprint = nextFingerprint;
    scheduleAssetRebuild(config, outDir);
  }));

  return {
    stop: async () => {
      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
}

let rebuildTimer: NodeJS.Timeout | undefined;
function scheduleAssetRebuild(config: LoadedAstroPressConfig, outDir: string) {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(async () => {
    try {
      const discovered = discoverAssets(config);
      const builtEntries = await buildAssetEntries(config, outDir, discovered.entries, 'development');
      writeAssetsManifest(config, outDir, discovered, builtEntries);
      console.log('✓ WordPress assets rebuilt');
    } catch (error) {
      console.error(`WordPress asset rebuild failed: ${error instanceof Error ? error.message : error}`);
    }
  }, 100);
}

function assetFingerprint(discovered: DiscoveredAssets) {
  const hash = createHash('sha1');
  const files = unique([
    ...discovered.blocks.map((block) => block.metadataFile),
    ...discovered.entries.map((entry) => entry.source),
  ]);

  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(existsSync(file) ? readFileSync(file) : '');
    hash.update('\0');
  }

  return hash.digest('hex');
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function discoverAssets(config: LoadedAstroPressConfig): DiscoveredAssets {
  const blocks = discoverBlocks(config);
  const pluginEntries = discoverPluginEntries(config);
  return {
    blocks,
    pluginEntries,
    entries: [...blocks.flatMap((block) => block.entries), ...pluginEntries],
  };
}

async function buildAssetEntries(
  config: LoadedAstroPressConfig,
  outDir: string,
  entries: AssetEntry[],
  mode: 'development' | 'production',
) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const builtEntries = new Map<string, AssetEntry>();

  for (const entry of entries) {
    if (entry.kind === 'style') {
      const file = `assets/${entry.id}.css`;
      mkdirSync(dirname(join(outDir, file)), { recursive: true });
      copyFileSync(entry.source, join(outDir, file));
      builtEntries.set(entry.id, { ...entry, file, css: [] });
      continue;
    }

    await build(viteAssetConfig(config, outDir, entry, mode));
    builtEntries.set(entry.id, { ...entry, file: `scripts/${entry.id}.js`, css: [] });
  }

  return builtEntries;
}

function writeAssetsManifest(
  config: LoadedAstroPressConfig,
  outDir: string,
  discovered: DiscoveredAssets,
  builtEntries: Map<string, AssetEntry>,
) {
  for (const block of discovered.blocks) {
    writeGeneratedBlockMetadata(outDir, block, builtEntries);
  }

  const manifest: AssetsManifest = {
    version: 1,
    blocks: discovered.blocks.map((block) => ({
      name: block.name,
      metadataFile: relative(config.root, generatedBlockMetadataFile(outDir, block)),
      directory: relative(config.root, generatedBlockDirectory(outDir, block)),
      entries: block.entries.map((entry) => builtEntries.get(entry.id) ?? entry).map(relativeEntry(config.root)),
    })),
    plugins: discovered.pluginEntries.map((entry) => builtEntries.get(entry.id) ?? entry).map(relativeEntry(config.root)),
  };

  writeFileSync(join(outDir, 'astropress-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function writeGeneratedBlockMetadata(outDir: string, block: DiscoveredBlock, builtEntries: Map<string, AssetEntry>) {
  const directory = generatedBlockDirectory(outDir, block);
  const metadata = { ...block.metadata };
  const fields = new Set(block.entries.map((entry) => entry.field).filter(Boolean));

  mkdirSync(directory, { recursive: true });

  for (const field of fields) {
    const entries = block.entries
      .filter((entry) => entry.field === field)
      .map((entry) => builtEntries.get(entry.id) ?? entry);

    if (entries.length === 0) continue;

    for (const entry of entries) {
      writeScriptAssetMetadata(outDir, entry);
    }

    const values = entries.map((entry) => blockAssetReference(directory, outDir, entry));
    metadata[field as string] = Array.isArray(block.metadata[field as string])
      ? values
      : values[0];
  }

  writeFileSync(generatedBlockMetadataFile(outDir, block), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function blockAssetReference(blockDirectory: string, outDir: string, entry: AssetEntry) {
  void blockDirectory;
  void outDir;
  return entry.handle;
}

function writeScriptAssetMetadata(outDir: string, entry: AssetEntry) {
  if (entry.kind !== 'script' || !entry.file) return;

  const assetFile = join(outDir, entry.file.replace(/\.m?js$/, '.asset.php'));
  mkdirSync(dirname(assetFile), { recursive: true });
  writeFileSync(
    assetFile,
    `<?php return array('dependencies' => ${phpArray(entry.dependencies)}, 'version' => null);\n`,
    'utf8',
  );
}

function phpArray(values: string[]) {
  return `array(${values.map((value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(', ')})`;
}

function generatedBlockDirectory(outDir: string, block: DiscoveredBlock) {
  return join(outDir, 'blocks', safeId(block.name));
}

function generatedBlockMetadataFile(outDir: string, block: DiscoveredBlock) {
  return join(generatedBlockDirectory(outDir, block), 'block.json');
}

function discoverBlocks(config: LoadedAstroPressConfig): DiscoveredBlock[] {
  const files = config.blocks.entries.flatMap((pattern) => findFiles(config.root, pattern));

  return files.map((metadataFile) => {
    const directory = dirname(metadataFile);
    const metadata = JSON.parse(readFileSync(metadataFile, 'utf8')) as Record<string, unknown>;
    const name = String(metadata.name ?? basename(directory));
    const entries = blockAssetFields.flatMap(([field, kind]) => {
      const values = normalizeAssetField(metadata[field]);
      return values
        .map((value) => resolveAssetReference(directory, value))
        .filter((source): source is string => Boolean(source))
        .map((source) => ({
          id: safeId(`${name}-${field}-${basename(source, extname(source))}`),
          source,
          kind,
          field,
          handle: safeId(`${name}-${field}`),
          dependencies: dependenciesForSource(source),
        }));
    });

    return { name, directory, metadataFile, metadata, entries };
  });
}

function discoverPluginEntries(config: LoadedAstroPressConfig): AssetEntry[] {
  return config.plugins.entries
    .flatMap((pattern) => findFiles(config.root, pattern))
    .filter((source) => /\.(m?[jt]sx?|css)$/.test(source))
    .map((source) => ({
      id: safeId(`plugin-${relative(config.root, source)}`),
      source,
      kind: source.endsWith('.css') ? 'style' : 'script',
      handle: safeId(`astropress-plugin-${basename(source, extname(source))}`),
      dependencies: dependenciesForSource(source),
    }));
}

function viteAssetConfig(
  config: LoadedAstroPressConfig,
  outDir: string,
  entry: AssetEntry,
  mode: 'development' | 'production',
): InlineConfig {
  return {
    root: config.root,
    mode,
    logLevel: 'warn',
    build: {
      emptyOutDir: false,
      manifest: false,
      outDir,
      sourcemap: mode === 'development',
      rollupOptions: {
        input: {
          [entry.id]: entry.source,
        },
        external: [/^@wordpress\//],
        output: {
          format: 'iife',
          entryFileNames: 'scripts/[name].js',
          chunkFileNames: 'scripts/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
}

function findFiles(root: string, pattern: string) {
  if (!pattern.includes('*')) {
    const file = resolve(root, pattern);
    return existsSync(file) ? [file] : [];
  }

  const [basePrefix, suffix] = pattern.split('**/');
  const base = resolve(root, basePrefix || '.');
  const expectedSuffix = suffix ?? basename(pattern);

  if (!existsSync(base)) {
    return [];
  }

  return walk(base).filter((file) => file.endsWith(expectedSuffix));
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const file = join(directory, entry);
    const stats = statSync(file);

    if (stats.isDirectory()) {
      return walk(file);
    }

    return stats.isFile() ? [file] : [];
  });
}

function normalizeAssetField(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function resolveAssetReference(directory: string, value: string) {
  if (!value.startsWith('file:')) return null;

  const file = resolve(directory, value.slice('file:'.length));
  return existsSync(file) ? file : null;
}

function dependenciesForSource(source: string) {
  if (!/\.[cm]?[jt]sx?$/.test(source)) return [];

  const code = readFileSync(source, 'utf8');
  const matches = code.matchAll(/from\s+['"](@wordpress\/[^'"]+)['"]|import\s+['"](@wordpress\/[^'"]+)['"]/g);
  const dependencies = new Set<string>();

  for (const match of matches) {
    const specifier = match[1] ?? match[2];
    if (specifier) {
      dependencies.add(wordPressDependencyHandle(specifier));
    }
  }

  for (const [global, handle] of Object.entries(wordPressGlobalDependencies)) {
    if (code.includes(global)) {
      dependencies.add(handle);
    }
  }

  return [...dependencies];
}

function wordPressDependencyHandle(specifier: string) {
  return specifier.replace('@wordpress/', 'wp-').replace(/\//g, '-');
}

const wordPressGlobalDependencies: Record<string, string> = {
  'wp.blocks': 'wp-blocks',
  'wp.blockEditor': 'wp-block-editor',
  'wp.components': 'wp-components',
  'wp.element': 'wp-element',
  'wp.i18n': 'wp-i18n',
};

function safeId(value: string) {
  return value.replace(/^@/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function relativeEntry(root: string) {
  return (entry: AssetEntry): AssetEntry => ({
    ...entry,
    source: relative(root, entry.source),
  });
}
