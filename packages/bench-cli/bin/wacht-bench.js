#!/usr/bin/env node

import { spawn } from 'node:child_process';

const MCP_URL = 'https://wacht.dev/docs/mcp';
const SKILLS_SOURCE = 'wacht-platform/bench';

function printHelp() {
  console.log(`Wacht Bench

Usage:
  wacht-bench init
  wacht-bench skills install [--skill <name>]
  wacht-bench mcp config --client <cursor|claude|codex>
  wacht-bench doctor

Examples:
  npx skills add ${SKILLS_SOURCE}
  pnpm dlx @wacht/bench init
  wacht-bench mcp config --client cursor`);
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function printMcpConfig(client) {
  if (client === 'claude') {
    console.log(JSON.stringify({
      mcpServers: {
        'wacht-docs': {
          command: 'npx',
          args: ['-y', 'mcp-remote', MCP_URL],
        },
      },
    }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    mcpServers: {
      'wacht-docs': {
        url: MCP_URL,
      },
    },
  }, null, 2));
}

function init() {
  console.log(`Install Wacht skills:

  npx skills add ${SKILLS_SOURCE}

Connect Wacht Docs MCP:

  wacht-bench mcp config --client cursor

Recommended project instruction:

  Use Wacht skills for Wacht implementation work.
  Before coding, use Wacht Docs MCP at ${MCP_URL}.`);
}

function skillsInstall(args) {
  const skill = valueAfter(args, '--skill');
  const installArgs = ['skills', 'add', SKILLS_SOURCE];
  if (skill) installArgs.push('--skill', skill);

  const child = spawn('npx', installArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
}

async function doctor() {
  console.log('Wacht Bench doctor');
  console.log(`- Skills source: ${SKILLS_SOURCE}`);
  console.log(`- Docs MCP: ${MCP_URL}`);

  try {
    const response = await fetch(MCP_URL);
    console.log(`- MCP reachability: HTTP ${response.status}`);
  } catch (error) {
    console.log(`- MCP reachability: failed (${error instanceof Error ? error.message : 'unknown error'})`);
  }

  console.log('- Skill install check: run `npx skills list` in your project.');
}

const args = process.argv.slice(2);
const [command, subcommand] = args;

if (!command || command === '--help' || command === '-h') {
  printHelp();
} else if (command === 'init') {
  init();
} else if (command === 'skills' && subcommand === 'install') {
  skillsInstall(args.slice(2));
} else if (command === 'mcp' && subcommand === 'config') {
  printMcpConfig(valueAfter(args, '--client') ?? 'cursor');
} else if (command === 'doctor') {
  await doctor();
} else {
  printHelp();
  process.exitCode = 1;
}
