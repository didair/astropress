import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { LoadedAstroPressConfig } from '../config.js';
import { spawnManaged, type ManagedProcess } from './process.js';

const execFileAsync = promisify(execFile);

export async function stopAstroServer(config: LoadedAstroPressConfig) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  await execFileAsync(npx, ['astro', 'dev', 'stop'], {
    cwd: config.root,
    env: process.env,
  }).catch(() => undefined);

  await killStaleAstroProcesses(config);
}

export async function startAstroServer(config: LoadedAstroPressConfig): Promise<ManagedProcess> {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  await stopAstroServer(config);

  await execFileAsync(
    npx,
    [
      'astro',
      'dev',
      '--background',
      '--host',
      config.dev.astroHost,
      '--port',
      String(config.dev.astroPort),
    ],
    {
      cwd: config.root,
      env: process.env,
    },
  );

  const logs = spawnManaged('astro', npx, ['astro', 'dev', 'logs', '--follow'], config.root, {
    shouldLogLine: (line) => isVerbose() || !line.includes('Local    http://'),
  });

  return {
    ...logs,
    critical: false,
    stop: () => {
      logs.stop();
      spawn(npx, ['astro', 'dev', 'stop'], {
        cwd: config.root,
        stdio: 'ignore',
        detached: true,
      }).unref();
    },
  };
}

function isVerbose() {
  return process.env.ASTROPRESS_VERBOSE === '1';
}

async function killStaleAstroProcesses(config: LoadedAstroPressConfig) {
  if (process.platform === 'win32') return;

  const { stdout } = await execFileAsync('ps', ['-Ao', 'pid=,command=']).catch(() => ({ stdout: '' }));
  const lines = stdout.split('\n');

  for (const line of lines) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const pid = Number(match[1]);
    const command = match[2] ?? '';

    if (
      pid !== process.pid
      && command.includes(`${config.root}/node_modules/astro/bin/astro.mjs`)
      && command.includes(' dev')
    ) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Ignore already-exited processes.
      }
    }
  }
}
