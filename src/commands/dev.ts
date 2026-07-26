import { loadAstroPressConfig } from '../config.js';
import { ensureComposerInstall } from '../runtime/composer.js';
import { randomBytes } from 'node:crypto';
import { startAstroServer, stopAstroServer } from '../runtime/astro.js';
import { startPhpServer } from '../runtime/php.js';
import { waitForExit } from '../runtime/process.js';
import { assertPortAvailable, resolveInternalPort } from '../runtime/ports.js';
import { startUnifiedProxy } from '../runtime/proxy.js';
import { phpServerUrl, writeWordPressConfig } from '../runtime/wp-config.js';
import { runDoctorChecks } from './doctor.js';
import { startWordPressAssetWatcher } from '../runtime/wp-assets.js';

export async function runDev() {
  const config = await loadAstroPressConfig();
  const verbose = isVerbose();
  if (verbose) {
    process.env.ASTROPRESS_VERBOSE = '1';
  }

  console.log('AstroPress dev runtime');
  console.log(`- local site: ${config.wordpress.url}`);
  console.log(`- WordPress docroot: ${config.wordpress.docroot}`);
  console.log(`- WordPress content: ${config.wordpress.contentDir}`);
  console.log(`- templates: ${config.templates.directory}`);
  console.log(`- database: ${config.database.driver}://${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`);
  console.log('');

  try {
    process.env.ASTROPRESS_INTERNAL_SECRET ??= randomBytes(32).toString('hex');
    process.env.ASTROPRESS_HOOKS_CACHE ??= config.wordpress.hooks.cache.enabled ? '1' : '0';
    process.env.ASTROPRESS_HOOKS_CACHE_TTL ??= String(config.wordpress.hooks.cache.ttl);
    process.env.ASTROPRESS_OMIT_DEFAULT_ASSETS ??= config.wordpress.omitDefaultAssets ? '1' : '0';
    await ensureComposerInstall(config);
    writeWordPressConfig(config);
    const result = await runDoctorChecks(config, { live: false });

    if (result.errors > 0) {
      console.log('');
      console.log('Fix the errors above before starting the dev runtime.');
      process.exitCode = 1;
      return;
    }

    await stopAstroServer(config);
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

  console.log('');
  if (verbose) {
    const publicUrl = new URL(config.wordpress.url);
    const proxyHost = config.dev.proxyHost || publicUrl.hostname;
    const proxyPort = config.dev.proxyPort || Number(publicUrl.port || 3000);
    console.log(`✓ AstroPress proxy listener: http://${proxyHost}:${proxyPort}`);
    console.log(`✓ WordPress/PHP internal server: ${phpServerUrl(config)}`);
    console.log(`✓ Astro internal server: http://${config.dev.astroHost}:${config.dev.astroPort}`);
  }

  const assets = await startWordPressAssetWatcher(config).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return undefined;
  });

  if (process.exitCode) {
    return;
  }

  const php = startPhpServer(config);
  const astro = await startAstroServer(config);
  const proxy = await startUnifiedProxy(config);

  console.log(`✓ AstroPress ready at ${proxy.url}`);
  console.log('Press Ctrl+C to stop.');
  console.log('');

  await waitForExit([php, astro]);
  await assets?.stop();
  await proxy.stop();
}

function isVerbose() {
  return process.argv.includes('--verbose') || process.env.ASTROPRESS_VERBOSE === '1';
}
