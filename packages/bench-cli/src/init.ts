import { spawn } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { MCP_URL } from './config.js';
import { detectProject, type ProjectProfile } from './project-detect.js';
import { installSkills } from './skills.js';
import type { CliContext } from './types.js';
import { command, field, log, printBannerFor, printJson, section, success } from './ui.js';

const AGENTS_START = '<!-- WACHT BENCH START -->';
const AGENTS_END = '<!-- WACHT BENCH END -->';

interface InitOptions {
  client: string;
  installSkills: boolean;
  skipAgents: boolean;
  skipEnv: boolean;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

export function parseInitOptions(args: string[]): InitOptions {
  return {
    client: valueAfter(args, '--client') ?? 'cursor',
    installSkills: hasFlag(args, '--install-skills'),
    skipAgents: hasFlag(args, '--skip-agents'),
    skipEnv: hasFlag(args, '--skip-env'),
  };
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function agentsBlock(profile: ProjectProfile): string {
  const frameworks = profile.frameworks.length ? profile.frameworks.join(', ') : 'Unknown';
  const skills = profile.suggestedSkills.join(', ');

  return `${AGENTS_START}
## Wacht Bench

This project is configured for AI-assisted Wacht development.

**Use the Wacht Bench CLI (\`wacht\`) for anything that touches Wacht state.** Don't write one-off scripts to call the Machine API — run a CLI command. Don't ask the user to click through the console for things the CLI can do.

- Detected project shape: \`${frameworks}\`.
- Suggested Wacht skills for this project: \`${skills}\`.
- Active skill router: \`wacht\` (always start there). For CLI work specifically, use the \`wacht-bench-cli\` skill.
- Install or update skills with \`wacht skills install\`.

### Where to look (single source of truth)

| Need | Source |
| --- | --- |
| Framework wiring patterns (provider, middleware, loaders) | Skills: \`${skills}\`. Always load before editing SDK code — never freelance the wiring. |
| Endpoint contracts, request/response shapes, errors | Wacht Docs MCP at \`${MCP_URL}\`. Required before calling any Machine API operation by hand. |
| Live deployment context (project id, deployment id, hosts) | \`wacht deployments current\` — re-run every time, never cache. |
| Available CLI surface | \`wacht --help\` and \`wacht <command> --help\`. |
| Any Machine API operation by name | \`wacht api ls --search <text>\` → \`wacht api describe <op>\` → \`wacht api call <op>\`. |

### Default CLI workflow

| Need | Command |
| --- | --- |
| Sign in / check session | \`wacht login\` · \`wacht auth status\` |
| Switch deployment | \`wacht deployments select\` · \`wacht deployments current\` |
| Manage users | \`wacht users list\` · \`wacht users get <id>\` · \`wacht users create --field …\` |
| Manage orgs / workspaces | \`wacht orgs list\` · \`wacht workspaces list --org <id>\` |
| Pull / diff / apply config | \`wacht config pull\` · \`wacht config diff\` · \`wacht config apply --yes\` |
| Configure Docs MCP across clients | \`wacht mcp install\` (interactive picker) · \`wacht mcp list\` |

### Rules for agent loops

- Pass \`--json --no-interactive\` to every CLI invocation inside an agent loop.
- Confirm the active deployment with \`wacht deployments current\` before any deployment-scoped change.
- Production config applies require \`--production --confirm <deployment_id> --yes\` — never bypass.
- Do not write on-disk snapshots of deployment state; query it live.

${AGENTS_END}`;
}

async function upsertAgentsBlock(root: string, profile: ProjectProfile): Promise<string> {
  const agentsPath = path.join(root, 'AGENTS.md');
  const existing = await readOptional(agentsPath);
  const nextBlock = agentsBlock(profile);

  if (!existing) {
    await writeFile(agentsPath, `${nextBlock}\n`, 'utf8');
    return agentsPath;
  }

  const start = existing.indexOf(AGENTS_START);
  const end = existing.indexOf(AGENTS_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start).trimEnd();
    const after = existing.slice(end + AGENTS_END.length).trimStart();
    const next = [before, nextBlock, after].filter(Boolean).join('\n\n');
    await writeFile(agentsPath, `${next.trimEnd()}\n`, 'utf8');
    return agentsPath;
  }

  await writeFile(agentsPath, `${existing.trimEnd()}\n\n${nextBlock}\n`, 'utf8');
  return agentsPath;
}

async function writeEnvTemplate(root: string, profile: ProjectProfile): Promise<string | null> {
  // If the project already ships a `.env.local.example` / `.env.example` (typical for
  // scaffolded starters), don't drop a second redundant file alongside it.
  for (const existing of ['.env.local.example', '.env.example']) {
    if (await pathExists(path.join(root, existing))) {
      return null;
    }
  }

  const envPath = path.join(root, '.env.wacht.example');
  const frameworks = new Set(profile.frameworks);
  const isVite = frameworks.has('React Router') || frameworks.has('TanStack Router');
  const publishableKeyVar = frameworks.has('Next.js')
    ? 'NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY'
    : isVite
      ? 'VITE_WACHT_PUBLISHABLE_KEY'
      : 'NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY';

  const lines = [
    '# Wacht SDK environment. Run `wacht env pull` to populate these automatically,',
    '# or copy values from https://console.wacht.dev.',
    '',
    '# Client-safe publishable key. Encodes deployment + frontend host.',
    `${publishableKeyVar}=`,
    '',
    '# Server-only API key for backend SDK calls. Never expose to the client.',
    'WACHT_API_KEY=',
    '',
  ];
  await writeFile(envPath, lines.join('\n'), 'utf8');
  return envPath;
}

export async function initProject(args: string[], ctx: CliContext): Promise<void> {
  const options = parseInitOptions(args);
  const root = process.cwd();
  const profile = await detectProject(root);
  const written: string[] = [];

  printBannerFor(ctx);
  log(ctx, section('Bootstrap Project'));
  log(ctx, field('Project root', root));
  log(ctx, field('Detected', profile.frameworks.length ? profile.frameworks.join(', ') : 'unknown project shape'));
  log(ctx, field('Suggested skills', profile.suggestedSkills.join(', ')));
  log(ctx, '');

  if (!options.skipEnv) {
    const envPath = await writeEnvTemplate(root, profile);
    if (envPath) written.push(envPath);
  }

  if (!options.skipAgents) {
    written.push(await upsertAgentsBlock(root, profile));
  }

  for (const filePath of written) {
    log(ctx, field('Updated', path.relative(root, filePath)));
  }

  if (options.installSkills) {
    log(ctx, '');
    log(ctx, section('Install Skills'));
    await installSkills({ yes: true });
  }

  if (ctx.json) {
    printJson({
      ok: true,
      root,
      written: written.map((filePath) => path.relative(root, filePath)),
      project: {
        packageManager: profile.packageManager,
        frameworks: profile.frameworks,
        suggestedSkills: profile.suggestedSkills,
      },
    });
    return;
  }

  log(ctx, '');
  log(ctx, success('Wacht Bench project bootstrap complete.'));
}

function printAgentBootstrapSteps(ctx: CliContext, opts: { starterDir?: string; installedSkills: boolean }): void {
  log(ctx, '');
  log(ctx, section('Next'));
  const cd = opts.starterDir ? `cd ${opts.starterDir} && ` : '';
  if (!opts.installedSkills) {
    log(ctx, `  ${command('wacht skills install --agent claude-code --global --yes')}`);
  }
  log(ctx, `  ${command('wacht mcp install --client claude-code-user --yes')}`);
  log(ctx, `  ${command('wacht login && wacht deployments select')}`);
  log(ctx, `  ${command(`${cd}wacht env pull`)}`);
  if (opts.starterDir) {
    log(ctx, `  ${command(`${cd}pnpm install && pnpm dev`)}`);
  }
  log(ctx, '');
  log(ctx, '(Restart your AI client after installing skills/MCP so they load.)');
}

// ─── Starter mode ───────────────────────────────────────────────────

const STARTERS: Record<string, { repo: string; description: string }> = {
  nextjs: {
    repo: 'https://github.com/wacht-platform/starter-nextjs.git',
    description: 'Next.js 16 App Router with Wacht middleware + provider',
  },
  'react-router': {
    repo: 'https://github.com/wacht-platform/starter-react-router.git',
    description: 'React Router with Wacht provider + loader auth',
  },
  tanstack: {
    repo: 'https://github.com/wacht-platform/starter-tanstack.git',
    description: 'TanStack Router with Wacht provider + beforeLoad auth',
  },
};

interface StarterOptions {
  framework?: string;
  target?: string;
  install: boolean;
  client: string;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function runGit(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { stdio: 'inherit' });
    child.on('error', (error) => reject(new Error(`git error: ${error.message}`)));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`git exited with code ${code}`))));
  });
}

export async function initStarter(options: StarterOptions, ctx: CliContext): Promise<void> {
  const framework = (options.framework ?? '').toLowerCase();
  if (!framework || !STARTERS[framework]) {
    const supported = Object.keys(STARTERS).join(', ');
    throw new Error(`Pass --starter <framework>. Supported: ${supported}.`);
  }
  const starter = STARTERS[framework];
  const target = options.target ?? `wacht-${framework}-starter`;
  const absoluteTarget = path.resolve(process.cwd(), target);

  if (await pathExists(absoluteTarget)) {
    throw new Error(`Target directory already exists: ${path.relative(process.cwd(), absoluteTarget) || '.'}`);
  }

  printBannerFor(ctx);
  log(ctx, section('Wacht Starter'));
  log(ctx, field('Framework', framework));
  log(ctx, field('Source', starter.repo));
  log(ctx, field('Target', path.relative(process.cwd(), absoluteTarget) || '.'));
  log(ctx, field('Notes', starter.description));
  log(ctx, '');

  await runGit(['clone', '--depth', '1', starter.repo, absoluteTarget]);

  // Run normal init in the new directory so AGENTS.md / .wacht/ are present.
  const previousCwd = process.cwd();
  try {
    process.chdir(absoluteTarget);
    await initProject(
      [
        '--client',
        options.client,
        ...(options.install ? ['--install-skills'] : []),
      ],
      ctx,
    );
  } finally {
    process.chdir(previousCwd);
  }

  if (ctx.json) {
    printJson({ ok: true, framework, target: absoluteTarget, source: starter.repo });
    return;
  }

  log(ctx, '');
  log(ctx, success(`Starter ready at ${path.relative(process.cwd(), absoluteTarget) || '.'}`));
  printAgentBootstrapSteps(ctx, {
    starterDir: path.relative(process.cwd(), absoluteTarget) || '.',
    installedSkills: options.install,
  });
}

export function listStarters(): { framework: string; description: string; repo: string }[] {
  return Object.entries(STARTERS).map(([framework, info]) => ({ framework, description: info.description, repo: info.repo }));
}
