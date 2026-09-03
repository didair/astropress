import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadAstroPressConfig } from '../config.js';
import { startAstroPreviewServer } from '../runtime/astro.js';
import { ensureComposerInstall } from '../runtime/composer.js';
import { startPhpServer } from '../runtime/php.js';
import { assertPortAvailable, resolveInternalPort } from '../runtime/ports.js';
import { startUnifiedProxy } from '../runtime/proxy.js';
import { waitForExit } from '../runtime/process.js';
import { phpServerUrl, writeWordPressConfig } from '../runtime/wp-config.js';
import { runDoctorChecks } from './doctor.js';

export async function runStart() {
  const config = await loadAstroPressConfig();
  const verbose = isVerbose();
  if (verbose) {
    process.env.ASTROPRESS_VERBOSE = '1';
  }

  process.env.NODE_ENV ??= 'production';

  console.log('AstroPress production runtime');
  console.log(`- site: ${config.wordpress.url}`);
  console.log(`- WordPress docroot: ${config.wordpress.docroot}`);
  console.log(`- WordPress content: ${config.wordpress.contentDir}`);
  console.log('');

  try {
    assertBuildOutput(config.root);
    process.env.ASTROPRESS_INTERNAL_SECRET ??= randomBytes(32).toString('hex');
    process.env.ASTROPRESS_HOOKS_CACHE ??= config.wordpress.hooks.cache.enabled ? '1' : '0';
    process.env.ASTROPRESS_HOOKS_CACHE_TTL ??= String(config.wordpress.hooks.cache.ttl);
    process.env.ASTROPRESS_OMIT_DEFAULT_ASSETS ??= config.wordpress.omitDefaultAssets ? '1' : '0';

    await ensureComposerInstall(config);
    writeWordPressConfig(config);

    const result = await runDoctorChecks(config, { live: false });
    if (result.errors > 0) {
      console.log('');
      console.log('Fix the errors above before starting the production runtime.');
      process.exitCode = 1;
      return;
    }

    config.dev.phpPort = await resolveInternalPort(config.dev.phpHost, config.dev.phpPort);
    config.dev.astroPort = await resolveInternalPort(config.dev.astroHost, config.dev.astroPort);
    const publicUrl = new URL(config.wordpress.url);
    const proxyHost = config.dev.proxyHost || publicUrl.hostname;
    const proxyPort = config.dev.proxyPort || Number(publicUrl.port || 3000);
    await assertPortAvailable(proxyHost, proxyPort, 'AstroPress proxy');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  process.env.ASTROPRESS_PUBLIC_URL = config.wordpress.url;
  process.env.ASTROPRESS_PHP_URL = phpServerUrl(config);

  if (verbose) {
    const publicUrl = new URL(config.wordpress.url);
    const proxyHost = config.dev.proxyHost || publicUrl.hostname;
    const proxyPort = config.dev.proxyPort || Number(publicUrl.port || 3000);
    console.log(`✓ AstroPress proxy listener: http://${proxyHost}:${proxyPort}`);
    console.log(`✓ WordPress/PHP internal server: ${phpServerUrl(config)}`);
    console.log(`✓ Astro preview internal server: http://${config.dev.astroHost}:${config.dev.astroPort}`);
  }

  const php = startPhpServer(config);
  const astro = await startAstroPreviewServer(config);
  const proxy = await startUnifiedProxy(config);

  console.log(`✓ AstroPress production runtime ready at ${proxy.url}`);
  console.log('Press Ctrl+C to stop.');
  console.log('');

  await waitForExit([php, astro]);
  await proxy.stop();
}

function assertBuildOutput(root: string) {
  const dist = join(root, 'dist');
  if (!existsSync(dist)) {
    throw new Error('Astro build output was not found at dist/. Run `astropress build` before `astropress start`.');
  }
}

function isVerbose() {
  return process.argv.includes('--verbose') || process.env.ASTROPRESS_VERBOSE === '1';
}
