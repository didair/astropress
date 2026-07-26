import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadAstroPressConfig, type LoadedAstroPressConfig } from '../config.js';

const execFileAsync = promisify(execFile);
const MINIMUM_PHP_VERSION = '8.3.0';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface Check {
  status: CheckStatus;
  label: string;
  detail?: string;
}

export async function runDoctor() {
  const config = await loadAstroPressConfig();
  const result = await runDoctorChecks(config);
  process.exitCode = result.errors > 0 ? 1 : 0;
}

export async function runDoctorChecks(config: LoadedAstroPressConfig, options: { live?: boolean } = {}) {
  const live = options.live ?? true;
  const checks: Check[] = [];

  checks.push({
    status: config.configFile ? 'pass' : 'warn',
    label: 'AstroPress config',
    detail: config.configFile ?? 'No astropress.config.* file found; using defaults.',
  });

  checks.push(fileCheck(config.root, 'astro.config.mjs', 'Astro config'));
  checks.push(fileCheck(config.root, 'composer.json', 'Composer manifest'));
  checks.push(composerPhpRequirementCheck(config.root));
  checks.push(composerWordPressCheck(config.root, config.composer.wordpressPackage));
  checks.push(composerInstallDirCheck(config));
  checks.push(fileCheck(config.root, 'composer.lock', 'Composer lockfile'));
  checks.push(composerLockCheck(config.root, config.composer.wordpressPackage));
  checks.push(fileCheck(config.root, `${config.wordpress.docroot}/wp-settings.php`, 'Composer-installed WordPress core'));
  checks.push(fileCheck(config.root, `${config.wordpress.docroot}/wp-config.php`, 'Generated wp-config.php'));
  checks.push(fileCheck(config.root, `${config.wordpress.contentDir}/mu-plugins/astropress-bridge.php`, 'AstroPress bridge mu-plugin'));
  checks.push(fileCheck(config.root, `${config.wordpress.contentDir}/mu-plugins/astropress-bridge/class-bridge.php`, 'AstroPress bridge classes'));
  checks.push(fileCheck(config.root, `${config.wordpress.contentDir}/themes/astropress/style.css`, 'AstroPress placeholder theme'));
  checks.push(wordPressAssetsCheck(config));
  checks.push(templateDirectoryCheck(config));
  checks.push(databaseConfigCheck(config));

  checks.push(await phpRuntimeCheck());
  checks.push(await commandCheck('composer', ['--version'], 'Composer'));

  checks.push(gitignoreCheck(config.root, config.wordpress.docroot));
  checks.push(runtimeFilesIgnoredCheck(config.root, config.wordpress.contentDir));
  checks.push(...requiredPluginFileChecks(config));
  checks.push(...pluginPresetChecks(config));
  if (live) {
    checks.push(await wordpressHealthCheck(config));
    checks.push(await wordpressAuthRoutesCheck(config));
  }

  printChecks(checks);

  const errors = checks.filter((check) => check.status === 'fail').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;

  console.log('');
  console.log(`Doctor finished with ${errors} error(s) and ${warnings} warning(s).`);

  return { errors, warnings };
}

function fileCheck(root: string, relativePath: string, label: string): Check {
  const path = join(root, relativePath);
  return existsSync(path)
    ? { status: 'pass', label, detail: relativePath }
    : { status: 'warn', label, detail: `${relativePath} does not exist yet.` };
}

function templateDirectoryCheck(config: LoadedAstroPressConfig): Check {
  const directory = join(config.root, config.templates.directory);

  return existsSync(directory)
    ? { status: 'pass', label: 'Project template overrides', detail: config.templates.directory }
    : {
        status: 'pass',
        label: 'Project template overrides',
        detail: `${config.templates.directory} is optional; package defaults will be used.`,
      };
}

async function commandCheck(command: string, args: string[], label: string): Promise<Check> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args);
    const firstLine = `${stdout}${stderr}`.split('\n').find(Boolean);
    return { status: 'pass', label, detail: firstLine };
  } catch {
    return { status: 'fail', label, detail: `${command} was not found on PATH.` };
  }
}

async function phpRuntimeCheck(): Promise<Check> {
  try {
    const { stdout, stderr } = await execFileAsync('php', ['-r', 'echo PHP_VERSION;']);
    const version = `${stdout}${stderr}`.trim();

    if (compareVersions(version, MINIMUM_PHP_VERSION) < 0) {
      return {
        status: 'fail',
        label: 'PHP runtime',
        detail: `PHP ${version} found; AstroPress requires PHP ${MINIMUM_PHP_VERSION} or newer.`,
      };
    }

    return {
      status: 'pass',
      label: 'PHP runtime',
      detail: `PHP ${version}`,
    };
  } catch {
    return { status: 'fail', label: 'PHP runtime', detail: 'php was not found on PATH.' };
  }
}

function compareVersions(a: string, b: string) {
  const left = versionParts(a);
  const right = versionParts(b);

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;

    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function versionParts(version: string) {
  return version.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
}

function databaseConfigCheck(config: LoadedAstroPressConfig): Check {
  const database = config.database;
  const missing = [
    ['host', database.host],
    ['name', database.name],
    ['user', database.user],
    ['tablePrefix', database.tablePrefix],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    return {
      status: 'fail',
      label: 'Database config',
      detail: `Missing ${missing.map(([key]) => key).join(', ')}.`,
    };
  }

  if (database.driver !== 'mysql' && database.driver !== 'mariadb') {
    return {
      status: 'fail',
      label: 'Database config',
      detail: `Unsupported driver: ${database.driver}.`,
    };
  }

  return {
    status: 'pass',
    label: 'Database config',
    detail: `${database.driver}://${database.user}@${database.host}:${database.port}/${database.name} (${database.tablePrefix})`,
  };
}

function composerPhpRequirementCheck(root: string): Check {
  const composerPath = join(root, 'composer.json');

  if (!existsSync(composerPath)) {
    return {
      status: 'warn',
      label: 'Composer PHP requirement',
      detail: 'composer.json does not exist yet.',
    };
  }

  try {
    const composer = JSON.parse(readFileSync(composerPath, 'utf8')) as {
      require?: Record<string, string>;
    };
    const requirement = composer.require?.php;

    if (!requirement) {
      return {
        status: 'fail',
        label: 'Composer PHP requirement',
        detail: `Add "php": ">=${MINIMUM_PHP_VERSION.replace(/\.0$/, '')}" to composer.json.`,
      };
    }

    const minimum = minimumPhpFromConstraint(requirement);

    if (!minimum) {
      return {
        status: 'warn',
        label: 'Composer PHP requirement',
        detail: `Could not verify "${requirement}"; AstroPress expects PHP ${MINIMUM_PHP_VERSION} or newer.`,
      };
    }

    if (compareVersions(minimum, MINIMUM_PHP_VERSION) < 0) {
      return {
        status: 'fail',
        label: 'Composer PHP requirement',
        detail: `"${requirement}" allows PHP ${minimum}; AstroPress requires PHP ${MINIMUM_PHP_VERSION} or newer.`,
      };
    }

    return {
      status: 'pass',
      label: 'Composer PHP requirement',
      detail: requirement,
    };
  } catch (error) {
    return {
      status: 'fail',
      label: 'Composer PHP requirement',
      detail: error instanceof Error ? error.message : 'Could not parse composer.json.',
    };
  }
}

function minimumPhpFromConstraint(requirement: string) {
  const candidates = requirement
    .split('||')
    .map((part) => part.trim().match(/(?:>=|\^|~)?\s*(\d+(?:\.\d+){0,2})/)?.[1])
    .filter((version): version is string => Boolean(version))
    .map(normalizeVersion);

  if (candidates.length === 0) return null;

  return candidates.sort(compareVersions)[0];
}

function normalizeVersion(version: string) {
  const parts = version.split('.');

  while (parts.length < 3) {
    parts.push('0');
  }

  return parts.slice(0, 3).join('.');
}

function composerWordPressCheck(root: string, wordpressPackage: string): Check {
  const composerPath = join(root, 'composer.json');

  if (!existsSync(composerPath)) {
    return {
      status: 'warn',
      label: 'Composer WordPress package',
      detail: 'composer.json does not exist yet.',
    };
  }

  try {
    const composer = JSON.parse(readFileSync(composerPath, 'utf8')) as {
      require?: Record<string, string>;
      extra?: { 'wordpress-install-dir'?: string };
    };
    const version = composer.require?.[wordpressPackage];

    if (!version) {
      return {
        status: 'fail',
        label: 'Composer WordPress package',
        detail: `${wordpressPackage} is not declared in composer.json.`,
      };
    }

    const installDir = composer.extra?.['wordpress-install-dir'];
    const installDetail = installDir ? ` -> ${installDir}` : '';

    return {
      status: 'pass',
      label: 'Composer WordPress package',
      detail: `${wordpressPackage}@${version}${installDetail}`,
    };
  } catch (error) {
    return {
      status: 'fail',
      label: 'Composer WordPress package',
      detail: error instanceof Error ? error.message : 'Could not parse composer.json.',
    };
  }
}

function composerInstallDirCheck(config: LoadedAstroPressConfig): Check {
  const composerPath = join(config.root, 'composer.json');

  if (!existsSync(composerPath)) {
    return {
      status: 'warn',
      label: 'Composer WordPress install dir',
      detail: 'composer.json does not exist yet.',
    };
  }

  try {
    const composer = JSON.parse(readFileSync(composerPath, 'utf8')) as {
      extra?: { 'wordpress-install-dir'?: string };
    };
    const installDir = composer.extra?.['wordpress-install-dir'];

    if (!installDir) {
      return {
        status: 'warn',
        label: 'Composer WordPress install dir',
        detail: 'extra.wordpress-install-dir is not set.',
      };
    }

    return installDir === config.wordpress.docroot
      ? { status: 'pass', label: 'Composer WordPress install dir', detail: installDir }
      : {
          status: 'fail',
          label: 'Composer WordPress install dir',
          detail: `${installDir} does not match config docroot ${config.wordpress.docroot}.`,
        };
  } catch (error) {
    return {
      status: 'fail',
      label: 'Composer WordPress install dir',
      detail: error instanceof Error ? error.message : 'Could not parse composer.json.',
    };
  }
}

function composerLockCheck(root: string, wordpressPackage: string): Check {
  const lockPath = join(root, 'composer.lock');

  if (!existsSync(lockPath)) {
    return {
      status: 'warn',
      label: 'Locked WordPress version',
      detail: 'Run composer install to create composer.lock.',
    };
  }

  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      packages?: Array<{ name?: string; version?: string }>;
    };
    const wordpress = lock.packages?.find((pkg) => pkg.name === wordpressPackage);

    if (!wordpress?.version) {
      return {
        status: 'fail',
        label: 'Locked WordPress version',
        detail: `${wordpressPackage} was not found in composer.lock.`,
      };
    }

    return {
      status: 'pass',
      label: 'Locked WordPress version',
      detail: `${wordpressPackage}@${wordpress.version}`,
    };
  } catch (error) {
    return {
      status: 'fail',
      label: 'Locked WordPress version',
      detail: error instanceof Error ? error.message : 'Could not parse composer.lock.',
    };
  }
}

function gitignoreCheck(root: string, docroot: string): Check {
  const gitignorePath = join(root, '.gitignore');

  if (!existsSync(gitignorePath)) {
    return { status: 'warn', label: 'Generated WordPress ignored', detail: '.gitignore is missing.' };
  }

  const gitignore = readFileSync(gitignorePath, 'utf8');
  const normalizedDocroot = docroot.endsWith('/') ? docroot : `${docroot}/`;

  return gitignore.includes(normalizedDocroot)
    ? { status: 'pass', label: 'Generated WordPress ignored', detail: normalizedDocroot }
    : {
        status: 'warn',
        label: 'Generated WordPress ignored',
        detail: `Add ${normalizedDocroot} to .gitignore.`,
      };
}

function runtimeFilesIgnoredCheck(root: string, contentDir: string): Check {
  const gitignorePath = join(root, '.gitignore');

  if (!existsSync(gitignorePath)) {
    return { status: 'warn', label: 'WordPress runtime files ignored', detail: '.gitignore is missing.' };
  }

  const gitignore = readFileSync(gitignorePath, 'utf8');
  const required = [
    `${contentDir}/astropress-assets/`,
    `${contentDir}/uploads/`,
    `${contentDir}/debug.log`,
  ];
  const missing = required.filter((entry) => !gitignore.includes(entry));

  return missing.length === 0
    ? { status: 'pass', label: 'WordPress runtime files ignored', detail: required.join(', ') }
    : {
        status: 'warn',
        label: 'WordPress runtime files ignored',
        detail: `Add ${missing.join(', ')} to .gitignore.`,
      };
}

function requiredPluginFileChecks(config: LoadedAstroPressConfig): Check[] {
  return config.wordpress.requiredPlugins.map((plugin) => {
    const directory = `${config.wordpress.contentDir}/plugins/${plugin}`;
    return fileCheck(config.root, directory, `Required plugin files: ${plugin}`);
  });
}

function pluginPresetChecks(config: LoadedAstroPressConfig): Check[] {
  return config.wordpress.pluginPresets.map((preset) => {
    const slug = pluginSlugForPreset(preset);
    return fileCheck(config.root, `${config.wordpress.contentDir}/plugins/${slug}`, `Plugin preset files: ${preset}`);
  });
}

function wordPressAssetsCheck(config: LoadedAstroPressConfig): Check {
  const manifest = join(config.root, config.blocks.outDir, 'astropress-manifest.json');
  const hasBlockSource = existsSync(join(config.root, 'src/blocks'));
  const hasPluginEntries = config.plugins.entries.length > 0;

  if (!hasBlockSource && !hasPluginEntries) {
    return {
      status: 'pass',
      label: 'WordPress asset manifest',
      detail: 'No block/plugin entries configured.',
    };
  }

  return existsSync(manifest)
    ? { status: 'pass', label: 'WordPress asset manifest', detail: relativePath(config.root, manifest) }
    : {
        status: 'warn',
        label: 'WordPress asset manifest',
        detail: `Run astropress dev to generate ${relativePath(config.root, manifest)}.`,
      };
}

async function wordpressHealthCheck(config: LoadedAstroPressConfig): Promise<Check> {
  const url = `${config.wordpress.url.replace(/\/$/, '')}/wp-json/astropress/v1/health`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return {
        status: 'warn',
        label: 'WordPress health endpoint',
        detail: `${url} returned ${response.status}. Start astropress dev if the runtime is offline.`,
      };
    }

    const health = await response.json() as {
      wordpressVersion?: string;
      phpVersion?: string;
      permalinkStructure?: string;
      activeTheme?: string;
      activePlugins?: string[];
    };
    const expectedPlugins = [
      ...config.wordpress.requiredPlugins,
      ...config.wordpress.pluginPresets.map(pluginSlugForPreset),
    ];
    const missingPlugins = expectedPlugins.filter((plugin) => {
      return !health.activePlugins?.some((active) => active === plugin || active.startsWith(`${plugin}/`));
    });

    if (health.phpVersion && compareVersions(health.phpVersion, MINIMUM_PHP_VERSION) < 0) {
      return {
        status: 'fail',
        label: 'WordPress health endpoint',
        detail: `WordPress is running PHP ${health.phpVersion}; AstroPress requires PHP ${MINIMUM_PHP_VERSION} or newer.`,
      };
    }

    if (missingPlugins.length > 0) {
      return {
        status: 'fail',
        label: 'WordPress health endpoint',
        detail: `Missing active plugin(s): ${missingPlugins.join(', ')}.`,
      };
    }

    return {
      status: 'pass',
      label: 'WordPress health endpoint',
      detail: `WP ${health.wordpressVersion ?? '?'} / PHP ${health.phpVersion ?? '?'} / theme ${health.activeTheme ?? '?'} / permalinks ${health.permalinkStructure || 'plain'}`,
    };
  } catch {
    return {
      status: 'warn',
      label: 'WordPress health endpoint',
      detail: `Could not reach ${url}. Start astropress dev to run live health checks.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function wordpressAuthRoutesCheck(config: LoadedAstroPressConfig): Promise<Check> {
  const url = `${config.wordpress.url.replace(/\/$/, '')}/wp-login.php`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
    });

    if (response.status >= 500 || response.status === 404) {
      return {
        status: 'fail',
        label: 'WordPress auth routes',
        detail: `${url} returned ${response.status}; login must be served by WordPress/PHP.`,
      };
    }

    return {
      status: 'pass',
      label: 'WordPress auth routes',
      detail: '/wp-login.php is served by WordPress.',
    };
  } catch {
    return {
      status: 'warn',
      label: 'WordPress auth routes',
      detail: `Could not reach ${url}. Start astropress dev to check login routing.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function pluginSlugForPreset(preset: string) {
  const presets: Record<string, string> = {
    yoast: 'wordpress-seo',
    woocommerce: 'woocommerce',
  };

  return presets[preset] ?? preset;
}

function relativePath(root: string, file: string) {
  return file.startsWith(root) ? file.slice(root.length + 1) : file;
}

function printChecks(checks: Check[]) {
  console.log('AstroPress doctor');
  console.log('');

  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '✕';
    console.log(`${icon} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`);
  }
}
