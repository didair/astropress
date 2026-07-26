import { spawn, type ChildProcess } from 'node:child_process';

export interface ManagedProcess {
  name: string;
  child: ChildProcess;
  stop: () => void;
  critical?: boolean;
}

export interface SpawnManagedOptions {
  shouldLogLine?: (line: string) => boolean;
}

export function spawnManaged(
  name: string,
  command: string,
  args: string[],
  cwd: string,
  options: SpawnManagedOptions = {},
): ManagedProcess {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout?.on('data', (chunk: Buffer) => writeLines(name, chunk, options));
  child.stderr?.on('data', (chunk: Buffer) => writeLines(name, chunk, options));

  return {
    name,
    child,
    stop: () => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    },
  };
}

export function waitForExit(processes: ManagedProcess[]): Promise<void> {
  return new Promise((resolve) => {
    let shuttingDown = false;

    const stopAll = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      for (const process of processes) {
        process.stop();
      }
      resolve();
    };

    process.once('SIGINT', stopAll);
    process.once('SIGTERM', stopAll);

    for (const managed of processes) {
      managed.child.once('exit', (code) => {
        if (!shuttingDown && managed.critical !== false) {
          console.log(`\n${managed.name} exited with code ${code ?? 'unknown'}. Stopping AstroPress dev runtime.`);
          stopAll();
        }
      });
    }
  });
}

function writeLines(name: string, chunk: Buffer, options: SpawnManagedOptions) {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (line.length > 0 && (options.shouldLogLine?.(line) ?? true)) {
      console.log(`[${name}] ${line}`);
    }
  }
}
