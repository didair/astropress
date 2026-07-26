import { loadAstroPressConfig } from '../config.js';
import { runComposer } from '../runtime/composer.js';

export async function runComposerCommand(args = process.argv.slice(3)) {
  const config = await loadAstroPressConfig();
  const composerArgs = args.length > 0 ? args : ['install'];

  try {
    await runComposer(config.root, composerArgs);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
