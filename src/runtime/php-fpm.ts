import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import net from 'node:net';
import type { LoadedAstroPressConfig } from '../config.js';
import { spawnManaged, type ManagedProcess } from './process.js';

export interface ProductionPhpRuntime {
  processes: ManagedProcess[];
}

export async function startProductionPhp(config: LoadedAstroPressConfig): Promise<ProductionPhpRuntime> {
  const fpm = findPhpFpm();
  requireCommand('nginx');

  const runtimeDir = resolve(config.root, '.astropress');
  const docroot = resolve(config.root, config.wordpress.docroot);
  const socket = join(runtimeDir, 'php-fpm.sock');
  const fpmConfig = join(runtimeDir, 'php-fpm.conf');
  const nginxConfig = join(runtimeDir, 'nginx.conf');
  const workers = Number(process.env.ASTROPRESS_PHP_FPM_WORKERS ?? 4);

  if (!Number.isInteger(workers) || workers < 1) {
    throw new Error('ASTROPRESS_PHP_FPM_WORKERS must be a positive integer.');
  }

  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(fpmConfig, renderFpmConfig(socket, workers));
  writeFileSync(nginxConfig, renderNginxConfig(config, docroot, socket, runtimeDir));

  checkConfig(fpm, ['-t', '-y', fpmConfig], 'PHP-FPM');
  checkConfig('nginx', ['-t', '-c', nginxConfig], 'Nginx');

  const php = spawnManaged('php-fpm', fpm, ['-F', '-y', fpmConfig], config.root);
  let gateway: ManagedProcess | undefined;
  try {
    await waitForListener(socket, php);
    gateway = spawnManaged('nginx', 'nginx', ['-c', nginxConfig], config.root);
    await waitForListener(config.dev.phpPort, gateway, config.dev.phpHost);
    return { processes: [php, gateway] };
  } catch (error) {
    gateway?.stop();
    php.stop();
    throw error;
  }
}

function waitForListener(address: string | number, process: ManagedProcess, host = '127.0.0.1'): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const failed = (error: Error) => finish(error);
    const exited = (code: number | null) => finish(new Error(`${process.name} exited before it was ready (${code ?? 'unknown'}).`));
    process.child.once('error', failed);
    process.child.once('exit', exited);

    function finish(error?: Error) {
      process.child.off('error', failed);
      process.child.off('exit', exited);
      if (error) reject(error);
      else resolve();
    }

    function attempt() {
      const socket = typeof address === 'string' ? net.connect(address) : net.connect(address, host);
      socket.once('connect', () => {
        socket.destroy();
        finish();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started >= 15_000) {
          finish(new Error(`Timed out waiting for ${process.name}.`));
        } else {
          setTimeout(attempt, 100);
        }
      });
    }

    attempt();
  });
}

function findPhpFpm() {
  const override = process.env.ASTROPRESS_PHP_FPM_BIN;
  if (override) {
    requireCommand(override);
    return override;
  }

  const version = execFileSync('php', ['-r', 'echo PHP_MAJOR_VERSION, ".", PHP_MINOR_VERSION;'], { encoding: 'utf8' }).trim();
  const candidates = [`php-fpm${version}`, 'php-fpm'];
  const found = candidates.find((command) => spawnSync(command, ['-v'], { stdio: 'ignore' }).status === 0);

  if (!found) {
    throw new Error('PHP-FPM was not found. Install php-fpm or set ASTROPRESS_PHP_FPM_BIN.');
  }

  return found;
}

function requireCommand(command: string) {
  const result = spawnSync(command, ['-v'], { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} was not found or could not start.`);
  }
}

function checkConfig(command: string, args: string[], label: string) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} config check failed: ${result.stderr?.trim() || result.error?.message || 'unknown error'}`);
  }
}

export function renderFpmConfig(socket: string, workers: number) {
  return `[global]
daemonize = no
error_log = /proc/self/fd/2

[astropress]
user = www-data
group = www-data
listen = ${socket}
listen.owner = www-data
listen.group = www-data
listen.mode = 0660
pm = dynamic
pm.max_children = ${workers}
pm.start_servers = 1
pm.min_spare_servers = 1
pm.max_spare_servers = ${workers}
clear_env = no
catch_workers_output = yes
`;
}

export function renderNginxConfig(config: LoadedAstroPressConfig, docroot: string, socket: string, runtimeDir: string) {
  return `worker_processes auto;
user www-data;
pid ${nginxPath(join(runtimeDir, 'nginx.pid'))};
error_log /dev/stderr warn;
daemon off;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    client_max_body_size 0;
    access_log off;
    server {
        listen ${config.dev.phpHost}:${config.dev.phpPort};
        server_name _;
        root ${nginxPath(docroot)};
        index index.php;

        location ~* ^/wp-content/uploads/.*\\.(?:php|phtml|phar)(?:/|$) { return 403; }
        location ~* \\.(?:phtml|phar)(?:/|$) { return 403; }
        location / { try_files $uri $uri/ /index.php?$args; }
        location ~ \\.php(?:/|$) {
            fastcgi_split_path_info ^(.+?\\.php)(/.*)$;
            try_files $fastcgi_script_name =404;
            include /etc/nginx/fastcgi_params;
            fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
            fastcgi_param PATH_INFO $fastcgi_path_info;
            fastcgi_pass unix:${nginxPath(socket)};
        }
    }
}
`;
}

function nginxPath(path: string) {
  if (/\s|[;{}]/.test(path)) {
    throw new Error(`Nginx path cannot contain spaces or config syntax: ${path}`);
  }
  return path;
}
