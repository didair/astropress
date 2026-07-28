import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  type?: string;
  [key: string]: unknown;
}

type UpgradeAction =
  | { kind: 'copy'; label: string; source: string; destination: string; force: boolean }
  | { kind: 'write'; label: string; destination: string; contents: string; force: boolean }
  | { kind: 'package'; label: string; destination: string };

interface PlannedChange {
  label: string;
  path: string;
  action: 'create' | 'overwrite' | 'skip' | 'update';
  backup?: string;
  detail?: string;
}

interface UpgradeOptions {
  dryRun: boolean;
  yes: boolean;
  noInstall: boolean;
  forceConfig: boolean;
  noBackup: boolean;
  timestamp: string;
}

export async function runUpgrade() {
  const root = process.cwd();
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const options = parseOptions();
  const ownPackage = readOwnPackage(packageRoot);
  const currentPackage = readProjectPackage(root);
  const packageManager = detectPackageManager(root);
  const actions = plannedActions(root, packageRoot, options);
  const changes = actions.map((action) => describeAction(root, action, options));
  const packageChanged = packageNeedsUpdate(currentPackage, ownPackage.version);

  printPlan({
    root,
    currentVersion: currentPackage.dependencies?.astropress ?? currentPackage.devDependencies?.astropress ?? 'not installed',
    targetVersion: ownPackage.version,
    packageManager,
    changes,
    packageChanged,
    options,
  });

  if (options.dryRun) {
    console.log('Dry run only. No files were changed.');
    return;
  }

  if (!options.yes && !(await confirmUpgrade())) {
    console.log('Upgrade cancelled.');
    return;
  }

  for (const action of actions) {
    applyAction(root, action, options);
  }

  updateProjectPackage(root, ownPackage.version);

  if (!options.noInstall) {
    installDependencies(root, packageManager);
  }

  console.log('');
  console.log('AstroPress upgrade complete.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review git diff and any *.astropress-*.old backups.');
  console.log('  2. Run astropress doctor.');
  console.log('  3. Run astropress types after the dev runtime is available.');
  console.log('  4. Run astro check.');
}

function parseOptions(): UpgradeOptions {
  return {
    dryRun: process.argv.includes('--dry-run'),
    yes: process.argv.includes('--yes') || process.argv.includes('-y'),
    noInstall: process.argv.includes('--no-install'),
    forceConfig: process.argv.includes('--force-config'),
    noBackup: process.argv.includes('--no-backup'),
    timestamp: timestamp(),
  };
}

function plannedActions(root: string, packageRoot: string, options: UpgradeOptions): UpgradeAction[] {
  const starter = join(packageRoot, 'starter');
  const defaults = join(packageRoot, 'defaults');
  const actions: UpgradeAction[] = [
    runtimeCopy(defaults, 'Bridge loader', 'mu-plugins/astropress-bridge.php'),
    runtimeCopy(defaults, 'Bridge classes', 'mu-plugins/astropress-bridge'),
    runtimeCopy(defaults, 'Placeholder theme', 'themes/astropress'),
    starterCopy(starter, 'Environment example', '.env.example'),
    starterCopy(starter, 'Astro config', 'astro.config.mjs'),
    starterCopy(starter, 'TypeScript config', 'tsconfig.json'),
    starterCopy(starter, 'Astro environment types', 'src/env.d.ts'),
    starterCopy(starter, 'Astro Live Collections config', 'src/live.config.ts'),
    starterCopy(starter, 'Starter base layout', 'src/templates/layouts/Base.astro'),
    {
      kind: 'write',
      label: 'Git ignore rules',
      destination: join(root, '.gitignore'),
      contents: renderGitignore(),
      force: true,
    },
  ];

  if (options.forceConfig || !existsSync(join(root, 'astropress.config.ts'))) {
    actions.push(starterCopy(starter, 'AstroPress config', 'astropress.config.ts'));
  }

  actions.push({ kind: 'package', label: 'Package manifest', destination: join(root, 'package.json') });
  return actions;
}

function runtimeCopy(defaults: string, label: string, path: string): UpgradeAction {
  return {
    kind: 'copy',
    label,
    source: join(defaults, 'wordpress/content', path),
    destination: join(process.cwd(), 'wordpress/content', path),
    force: true,
  };
}

function starterCopy(starter: string, label: string, path: string): UpgradeAction {
  return {
    kind: 'copy',
    label,
    source: join(starter, path),
    destination: join(process.cwd(), path),
    force: true,
  };
}

function describeAction(root: string, action: UpgradeAction, options: UpgradeOptions): PlannedChange {
  const path = relative(root, action.destination) || '.';

  if (action.kind === 'package') {
    return {
      label: action.label,
      path,
      action: existsSync(action.destination) ? 'update' : 'create',
      backup: backupPath(action.destination, options),
      detail: 'Patch AstroPress dependency and add missing AstroPress scripts.',
    };
  }

  if (action.kind === 'write') {
    if (!existsSync(action.destination)) {
      return { label: action.label, path, action: 'create' };
    }

    return {
      label: action.label,
      path,
      action: action.force ? 'overwrite' : 'skip',
      backup: action.force ? backupPath(action.destination, options) : undefined,
    };
  }

  if (!existsSync(action.source)) {
    return {
      label: action.label,
      path,
      action: 'skip',
      detail: `Package source is missing: ${relative(root, action.source)}`,
    };
  }

  if (!existsSync(action.destination)) {
    return { label: action.label, path, action: 'create' };
  }

  return {
    label: action.label,
    path,
    action: action.force ? 'overwrite' : 'skip',
    backup: action.force ? backupPath(action.destination, options) : undefined,
  };
}

function applyAction(root: string, action: UpgradeAction, options: UpgradeOptions) {
  if (action.kind === 'package') {
    backupExisting(action.destination, options);
    return;
  }

  if (action.kind === 'write') {
    if (existsSync(action.destination)) {
      if (!action.force) return;
      backupExisting(action.destination, options);
      rmSync(action.destination, { recursive: true, force: true });
    }

    mkdirSync(dirname(action.destination), { recursive: true });
    writeFileSync(action.destination, action.contents, 'utf8');
    console.log(`✓ Wrote ${relative(root, action.destination)}`);
    return;
  }

  if (!existsSync(action.source)) {
    console.log(`! Skipping ${relative(root, action.destination)} because the package source is missing.`);
    return;
  }

  if (existsSync(action.destination)) {
    if (!action.force) return;
    backupExisting(action.destination, options);
    rmSync(action.destination, { recursive: true, force: true });
  }

  mkdirSync(dirname(action.destination), { recursive: true });
  cpSync(action.source, action.destination, { recursive: true, force: true });
  console.log(`✓ Updated ${relative(root, action.destination)}`);
}

function backupExisting(file: string, options: UpgradeOptions) {
  if (options.noBackup || !existsSync(file)) return;

  const backup = backupPath(file, options);
  if (!backup) return;
  mkdirSync(dirname(backup), { recursive: true });
  cpSync(file, backup, { recursive: true, force: true });
  console.log(`✓ Backed up ${relative(process.cwd(), file)} to ${relative(process.cwd(), backup)}`);
}

function backupPath(file: string, options: UpgradeOptions) {
  if (options.noBackup) return undefined;

  const base = `${file}.astropress-${options.timestamp}.old`;
  if (!existsSync(base)) return base;

  for (let index = 2; ; index += 1) {
    const candidate = `${base}.${index}`;
    if (!existsSync(candidate)) return candidate;
  }
}

function updateProjectPackage(root: string, version: string) {
  const file = join(root, 'package.json');
  const packageJson = readProjectPackage(root);

  packageJson.type ??= 'module';
  packageJson.scripts ??= {};
  packageJson.dependencies ??= {};
  packageJson.devDependencies ??= {};
  packageJson.scripts.dev ??= 'astropress dev';
  packageJson.scripts.doctor ??= 'astropress doctor';
  packageJson.scripts.types ??= 'astropress types';
  packageJson.scripts.composer ??= 'astropress composer';
  packageJson.scripts.wp ??= 'astropress wp';
  packageJson.scripts.check ??= 'astro check';
  packageJson.scripts.upgrade ??= 'astropress upgrade';

  if (packageJson.dependencies.astropress !== undefined) {
    packageJson.dependencies.astropress = `^${version}`;
  } else if (packageJson.devDependencies.astropress !== undefined) {
    packageJson.devDependencies.astropress = `^${version}`;
  } else {
    packageJson.dependencies.astropress = `^${version}`;
  }

  packageJson.dependencies.astro ??= '^7.0.6';
  packageJson.devDependencies.typescript ??= '~6.0.2';
  packageJson.devDependencies['@astrojs/check'] ??= '^0.9.9';

  writeFileSync(file, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  console.log(`✓ Updated ${relative(root, file)}`);
}

function packageNeedsUpdate(packageJson: PackageJson, version: string) {
  const current = packageJson.dependencies?.astropress ?? packageJson.devDependencies?.astropress;
  return current !== `^${version}`;
}

function readProjectPackage(root: string): PackageJson {
  const file = join(root, 'package.json');
  if (!existsSync(file)) return { type: 'module' };
  return JSON.parse(readFileSync(file, 'utf8')) as PackageJson;
}

function readOwnPackage(packageRoot: string) {
  const file = join(packageRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(file, 'utf8')) as { version?: string };
  return { version: packageJson.version ?? '0.1.0' };
}

function printPlan(input: {
  root: string;
  currentVersion: string;
  targetVersion: string;
  packageManager: string;
  changes: PlannedChange[];
  packageChanged: boolean;
  options: UpgradeOptions;
}) {
  console.log('AstroPress upgrade');
  console.log('');
  console.log(`Project: ${input.root}`);
  console.log(`Installed version: ${input.currentVersion}`);
  console.log(`Target version: ^${input.targetVersion}`);
  console.log(`Package manager: ${input.packageManager}`);
  console.log(`Backups: ${input.options.noBackup ? 'disabled' : 'enabled'}`);
  console.log('');

  if (input.packageChanged) {
    console.log('Package dependency will be updated.');
    console.log('');
  }

  printChanges('Files to create', input.changes.filter((change) => change.action === 'create'), input.root);
  printChanges('Files to overwrite', input.changes.filter((change) => change.action === 'overwrite'), input.root);
  printChanges('Files to update', input.changes.filter((change) => change.action === 'update'), input.root);
  printChanges('Files to skip', input.changes.filter((change) => change.action === 'skip'), input.root);

  if (!input.options.forceConfig) {
    const skippedConfig = ['astropress.config.ts'].filter((file) => existsSync(join(input.root, file)));
    if (skippedConfig.length > 0) {
      console.log('Config files intentionally left alone by default:');
      for (const file of skippedConfig) console.log(`  ! ${file} (use --force-config to overwrite with backup)`);
      console.log('');
    }
  }
}

function printChanges(title: string, changes: PlannedChange[], root: string) {
  if (changes.length === 0) return;

  console.log(`${title}:`);
  for (const change of changes) {
    const backup = change.backup ? ` -> backup ${relative(root, change.backup)}` : '';
    const detail = change.detail ? ` (${change.detail})` : '';
    console.log(`  - ${change.path}${backup}${detail}`);
  }
  console.log('');
}

async function confirmUpgrade() {
  if (!process.stdin.isTTY) {
    console.error('Refusing to overwrite files without an interactive terminal. Re-run with --yes to confirm.');
    return false;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Continue and overwrite the files above? [y/N] ');
  rl.close();
  return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
}

function detectPackageManager(root: string) {
  const userAgent = process.env.npm_config_user_agent ?? '';

  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  if (userAgent.startsWith('bun')) return 'bun';
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

function installDependencies(root: string, packageManager: string) {
  const args = packageManager === 'yarn' ? [] : ['install'];
  console.log('');
  console.log(`Installing dependencies with ${packageManager}...`);

  const result = spawnSync(packageManager, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    console.log('');
    console.log(`Dependency install did not complete. Run ${packageManager} ${args.join(' ')} manually.`.trim());
  }
}

function timestamp() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function renderGitignore() {
  return `# Dependencies
node_modules/
vendor/

# Environment
.env
.env.*
!.env.example

# Build output
dist/
dist-ssr/

# AstroPress generated/runtime files
.astropress/
.astro/
wordpress/public/
wordpress/content/mu-plugins/astropress-bridge.php
wordpress/content/mu-plugins/astropress-bridge/
wordpress/content/themes/astropress/
wordpress/content/astropress-assets/
wordpress/content/uploads/
wordpress/content/debug.log

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*

# Editor and OS files
.DS_Store
.idea/
.vscode/*
!.vscode/extensions.json
`;
}
