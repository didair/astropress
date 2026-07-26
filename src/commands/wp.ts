import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { loadAstroPressConfig, type LoadedAstroPressConfig } from '../config.js';

export async function runWpCommand(args = process.argv.slice(3)) {
  const config = await loadAstroPressConfig();
  const command = wpBinary(config);

  if (!command) {
    console.error('Could not find WP-CLI. Install it globally as `wp` or add it to Composer.');
    process.exitCode = 1;
    return;
  }

  const wpArgs = [
    `--path=${config.wordpress.docroot}`,
    `--url=${config.wordpress.url}`,
    ...args,
  ];

  const code = await spawnWp(config, command, wpArgs);
  process.exitCode = code;
}

function wpBinary(config: LoadedAstroPressConfig) {
  const local = join(config.root, 'vendor/bin/wp');

  if (existsSync(local)) {
    return local;
  }

  return process.platform === 'win32' ? 'wp.cmd' : 'wp';
}

function spawnWp(config: LoadedAstroPressConfig, command: string, args: string[]) {
  return new Promise<number>((resolve) => {
    const child = spawn(command, args, {
      cwd: config.root,
      stdio: 'inherit',
      env: process.env,
    });

    child.once('exit', (code) => resolve(code ?? 1));
    child.once('error', (error) => {
      console.error(`Could not run WP-CLI (${command}). ${error.message}`);
      resolve(1);
    });
  });
}
