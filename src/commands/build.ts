import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { loadAstroPressConfig, type LoadedAstroPressConfig } from '../config.js';
import { runAstroBuild } from '../runtime/astro.js';
import { ensureComposerInstall } from '../runtime/composer.js';
import { buildWordPressAssets } from '../runtime/wp-assets.js';
import { writeWordPressConfig } from '../runtime/wp-config.js';
import { runDoctorChecks } from './doctor.js';

export async function runBuild() {
  const config = await loadAstroPressConfig();
  process.env.NODE_ENV ??= 'production';
  process.env.ASTROPRESS_PUBLIC_URL = config.wordpress.url;
  process.env.ASTROPRESS_OMIT_DEFAULT_ASSETS ??= config.wordpress.omitDefaultAssets ? '1' : '0';

  console.log('AstroPress production build');
  console.log(`- site: ${config.wordpress.url}`);
  console.log(`- WordPress docroot: ${config.wordpress.docroot}`);
  console.log(`- WordPress content: ${config.wordpress.contentDir}`);
  console.log('');

  try {
    await ensureComposerInstall(config);
    writeWordPressConfig(config);

    const result = await runDoctorChecks(config, { live: false });
    if (result.errors > 0) {
      console.log('');
      console.log('Fix the errors above before building.');
      process.exitCode = 1;
      return;
    }

    await buildWordPressAssets(config, { mode: 'production' });
    await runAstroBuild(config);
    writeDeployManifest(config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('✓ AstroPress build complete.');
  console.log('');
  console.log('Deployable outputs:');
  console.log(`- Astro build output: dist/`);
  console.log(`- WordPress runtime/content: ${config.wordpress.contentDir}`);
  console.log(`- WordPress core/docroot: ${config.wordpress.docroot}`);
  console.log(`- WordPress assets: ${config.blocks.outDir}`);
  console.log(`- Deploy manifest: .astropress/deploy.json`);
}

function writeDeployManifest(config: LoadedAstroPressConfig) {
  const file = join(config.root, '.astropress/deploy.json');
  const publicRoutes = [
    '/wp-admin/*',
    '/wp-login.php',
    '/wp-json/*',
    '/wp-content/*',
    '/wp-includes/*',
    '/*.php',
  ];
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    siteUrl: config.wordpress.url,
    artifacts: {
      astro: 'dist/',
      wordpressDocroot: config.wordpress.docroot,
      wordpressContent: config.wordpress.contentDir,
      wordpressAssets: config.blocks.outDir,
    },
    routing: {
      wordpress: publicRoutes,
      astro: ['/*'],
    },
    media: {
      uploads: `${config.wordpress.contentDir}/uploads`,
      strategy: 'wordpress-origin',
      cdnSync: false,
      rewriteUrls: false,
      astroImagePipeline: false,
    },
  };

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`✓ Deploy manifest written to ${relative(config.root, file)}`);
}
