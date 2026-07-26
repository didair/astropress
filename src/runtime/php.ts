import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { LoadedAstroPressConfig } from '../config.js';
import { spawnManaged, type ManagedProcess } from './process.js';

export function startPhpServer(config: LoadedAstroPressConfig): ManagedProcess {
  const docroot = resolve(config.root, config.wordpress.docroot);
  const contentDir = resolve(config.root, config.wordpress.contentDir);
  const router = writePhpRouter(config, docroot, contentDir);

  return spawnManaged(
    'php',
    'php',
    ['-S', `${config.dev.phpHost}:${config.dev.phpPort}`, '-t', docroot, router],
    config.root,
    {
      shouldLogLine: shouldLogPhpLine,
    },
  );
}

function isVerbose() {
  return process.env.ASTROPRESS_VERBOSE === '1';
}

function shouldLogPhpLine(line: string) {
  if (isVerbose()) return true;

  if (line.includes('Development Server (http://')) return false;
  if (/\sAccepted$/.test(line)) return false;
  if (/\sClosing$/.test(line)) return false;
  if (/\[(?:2\d\d|3\d\d)\]:\s/.test(line)) return false;

  return true;
}

function writePhpRouter(config: LoadedAstroPressConfig, docroot: string, contentDir: string) {
  const runtimeDir = resolve(config.root, '.astropress');
  const routerPath = join(runtimeDir, 'php-router.php');

  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(routerPath, renderRouter(docroot, contentDir), 'utf8');

  return relative(config.root, routerPath);
}

function renderRouter(docroot: string, contentDir: string) {
  return `<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$file = ${phpString(docroot)} . $path;
$content_dir = ${phpString(contentDir)};

if (str_starts_with($path, '/wp-content/')) {
    $content_file = $content_dir . substr($path, strlen('/wp-content'));

    if (is_file($content_file)) {
        $type = astropress_content_type($content_file);

        if ($type) {
            header('Content-Type: ' . $type);
        }

        readfile($content_file);
        return true;
    }
}

if ($path !== '/' && is_file($file)) {
    return false;
}

if ($path !== '/' && is_dir($file) && is_file(rtrim($file, '/') . '/index.php')) {
    $_SERVER['SCRIPT_NAME'] = rtrim($path, '/') . '/index.php';
    $_SERVER['SCRIPT_FILENAME'] = rtrim($file, '/') . '/index.php';
    require rtrim($file, '/') . '/index.php';
    return true;
}

function astropress_content_type(string $file): string
{
    return match (strtolower(pathinfo($file, PATHINFO_EXTENSION))) {
        'css' => 'text/css; charset=UTF-8',
        'js' => 'application/javascript; charset=UTF-8',
        'json' => 'application/json; charset=UTF-8',
        'svg' => 'image/svg+xml',
        'webp' => 'image/webp',
        'png' => 'image/png',
        'jpg', 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
        default => mime_content_type($file) ?: 'application/octet-stream',
    };
}

$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['SCRIPT_FILENAME'] = ${phpString(join(docroot, 'index.php'))};
require ${phpString(join(docroot, 'index.php'))};
return true;
`;
}

function phpString(value: string) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
