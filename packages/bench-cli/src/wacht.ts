#!/usr/bin/env node

import { runCli } from './commands.js';
import { printError } from './ui.js';

try {
  await runCli(process.argv.slice(2));
} catch (error) {
  if (process.argv.includes('--json')) {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
  } else {
    printError(error);
  }
  process.exitCode = 1;
}
