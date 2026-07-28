#!/usr/bin/env node
import { runDev } from './commands/dev.js';
import { runDoctor } from './commands/doctor.js';
import { runSmoke } from './commands/smoke.js';
import { runTypes } from './commands/types.js';
import { runInit } from './commands/init.js';
import { runComposerCommand } from './commands/composer.js';
import { runWpCommand } from './commands/wp.js';
import { runUpgrade } from './commands/upgrade.js';

const command = process.argv[2] ?? 'help';

switch (command) {
  case 'dev':
    await runDev();
    break;
  case 'doctor':
    await runDoctor();
    break;
  case 'init':
    runInit();
    break;
  case 'upgrade':
    await runUpgrade();
    break;
  case 'types':
    await runTypes();
    break;
  case 'composer':
    await runComposerCommand();
    break;
  case 'wp':
    await runWpCommand();
    break;
  case 'smoke':
    await runSmoke();
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
}

function printHelp() {
  console.log(`astropress\n\nUsage:\n  astropress init      Copy starter project files into the current directory
  astropress upgrade   Update AstroPress package and managed project files
  astropress dev       Start the local WordPress + Astro development runtime
  astropress doctor    Check the current project setup
  astropress types     Generate TypeScript types from WordPress metadata
  astropress composer  Run Composer in the AstroPress project
  astropress wp        Run WP-CLI for the local WordPress runtime
  astropress smoke     Verify the running AstroPress dev runtime

Options:
  astropress init --no-install      Create files without running package install
  astropress upgrade --dry-run      Show planned upgrade changes without writing
  astropress upgrade --yes          Skip overwrite confirmation
  astropress upgrade --force-config Overwrite config-heavy files with backups\n`);
}
