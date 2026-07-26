import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { LoadedAstroPressConfig } from '../config.js';

export async function ensureComposerInstall(config: LoadedAstroPressConfig) {
  if (!config.composer.install) {
    console.log('Composer install disabled by config.');
    return;
  }

  const lockfile = join(config.root, 'composer.lock');
  const manifest = join(config.root, 'composer.json');
  const vendor = join(config.root, 'vendor');
  const wpSettings = join(config.root, config.wordpress.docroot, 'wp-settings.php');

  if (!existsSync(manifest)) {
    throw new Error('composer.json is missing. Run `astropress init` or add a Composer manifest before starting dev.');
  }

  if (existsSync(lockfile) && existsSync(vendor) && existsSync(wpSettings)) {
    console.log('✓ Composer dependencies already installed');
    return;
  }

  console.log('Installing Composer dependencies...');
  await runComposer(config.root, ['install']);
  console.log('✓ Composer dependencies ready');
}

export function runComposer(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('composer', args, {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, COMPOSER_ALLOW_SUPERUSER: process.env.COMPOSER_ALLOW_SUPERUSER ?? '1' },
    });

    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`composer ${args.join(' ')} failed with code ${code ?? 'unknown'}.`));
      }
    });

    child.once('error', (error) => {
      reject(new Error(`Could not run composer. Is Composer installed?\n${error.message}`));
    });
  });
}
