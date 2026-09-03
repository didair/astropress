import { execFile, spawn } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';
import type { LoadedAstroPressConfig } from '../config.js';
import { spawnManaged, type ManagedProcess } from './process.js';

const execFileAsync = promisify(execFile);

export async function runAstroBuild(config: LoadedAstroPressConfig) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  await runCommand(npx, ['astro', 'build'], config.root);
}

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

export async function startAstroPreviewServer(config: LoadedAstroPressConfig): Promise<ManagedProcess> {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const preview = spawnManaged(
    'astro',
    npx,
    ['astro', 'preview', '--host', config.dev.astroHost, '--port', String(config.dev.astroPort)],
    config.root,
  );

  try {
    await waitForTcp(config.dev.astroHost, config.dev.astroPort, 15_000);
  } catch (error) {
    preview.stop();
    throw error;
  }

  return preview;
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });

    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code ?? 'unknown'}.`));
      }
    });

    child.once('error', reject);
  });
}

function waitForTcp(host: string, port: number, timeoutMs: number) {
  const started = Date.now();

  return new Promise<void>((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, host);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for Astro preview at ${host}:${port}.`));
          return;
        }
        setTimeout(attempt, 100);
      });
    };

    attempt();
  });
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
