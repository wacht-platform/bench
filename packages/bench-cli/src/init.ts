import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  MACHINE_API_URL,
  MCP_URL,
  OAUTH_CLIENT_ID,
  OAUTH_ISSUER,
  OAUTH_SCOPES,
  REDIRECT_URI,
  SKILLS_SOURCE,
  PLATFORM_OPENAPI_URL,
} from './config.js';
import { readBenchContext } from './context-store.js';
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
  skipConfig: boolean;
  skipEnv: boolean;
  skipGuide: boolean;
  skipTemplates: boolean;
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
    skipConfig: hasFlag(args, '--skip-config'),
    skipEnv: hasFlag(args, '--skip-env'),
    skipGuide: hasFlag(args, '--skip-guide'),
    skipTemplates: hasFlag(args, '--skip-templates'),
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
- Before coding Wacht behavior, consult Wacht Docs MCP at \`${MCP_URL}\`.
- Install or update skills with \`npx skills add ${SKILLS_SOURCE}\`.

### Default CLI workflow

| Need | Command |
| --- | --- |
| Sign in / check session | \`wacht login\` · \`wacht auth status\` |
| Switch deployment | \`wacht deployments select\` · \`wacht deployments current\` |
| Manage users | \`wacht users list\` · \`wacht users get <id>\` · \`wacht users create --field …\` |
| Manage orgs / workspaces | \`wacht orgs list\` · \`wacht workspaces list --org <id>\` |
| Pull / diff / apply config | \`wacht config pull\` · \`wacht config diff\` · \`wacht config apply --yes\` |
| Discover any Machine API operation | \`wacht api ls --search <text>\` · \`wacht api describe <op>\` · \`wacht api call <op>\` |

Always pass \`--json\` and \`--no-interactive\` when running commands inside an agent loop. Confirm the active deployment with \`wacht deployments current\` before any deployment-scoped change. Production config applies require \`--production --confirm <deployment_id> --yes\`.

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

async function writeBenchConfig(root: string, profile: ProjectProfile, options: InitOptions): Promise<string> {
  const wachtDir = path.join(root, '.wacht');
  await mkdir(wachtDir, { recursive: true });

  const configPath = path.join(wachtDir, 'bench.json');
  const config = {
    version: 1,
    client: options.client,
    skillsSource: SKILLS_SOURCE,
    docsMcpUrl: MCP_URL,
    machineApiUrl: MACHINE_API_URL,
    openApiUrl: PLATFORM_OPENAPI_URL,
    oauth: {
      issuer: OAUTH_ISSUER,
      clientId: OAUTH_CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scopes: OAUTH_SCOPES.split(' '),
    },
    project: {
      packageManager: profile.packageManager,
      frameworks: profile.frameworks,
      suggestedSkills: profile.suggestedSkills,
    },
  };

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return configPath;
}

function frameworkChecklist(profile: ProjectProfile): string[] {
  const frameworks = new Set(profile.frameworks);
  if (frameworks.has('Next.js')) {
    return [
      'Review `.wacht/templates/nextjs/wacht-provider.tsx` as a provider reference only.',
      'Review `.wacht/templates/nextjs/middleware.ts` as a protected-route reference only.',
      'Use `wacht-nextjs-patterns` and Wacht Docs MCP before making app edits.',
      'Let the assistant adapt the template to the existing layout, route groups, and Next.js version.',
      'Keep publishable/frontend values separate from server-only secrets.',
    ];
  }
  if (frameworks.has('React Router')) {
    return [
      'Review `.wacht/templates/react-router/wacht-provider.tsx` as a provider reference only.',
      'Review `.wacht/templates/react-router/protected-loader.ts` as a loader/action reference only.',
      'Use `wacht-react-router-patterns` and Wacht Docs MCP before making app edits.',
      'Let the assistant adapt the template to the existing root route and data APIs.',
    ];
  }
  if (frameworks.has('TanStack Router')) {
    return [
      'Review `.wacht/templates/tanstack-router/wacht-provider.tsx` as a provider reference only.',
      'Review `.wacht/templates/tanstack-router/protected-request.ts` as a request-auth reference only.',
      'Use `wacht-tanstack-router-patterns` and Wacht Docs MCP before making app edits.',
      'Let the assistant adapt the template to the existing router context and route tree.',
    ];
  }
  return [
    'Review `.wacht/templates/wacht-contract.ts` for deployment/env assumptions.',
    'Select an active deployment with `wacht deployments select`.',
    'Use Wacht Docs MCP and the suggested skills before choosing framework-specific app edits.',
  ];
}

async function writeEnvTemplate(root: string): Promise<string> {
  const context = await readBenchContext();
  const envPath = path.join(root, '.env.wacht.example');
  const lines = [
    '# Generated by Wacht Bench. Copy values into your local env file as needed.',
    `WACHT_MACHINE_API_URL=${MACHINE_API_URL}`,
    `WACHT_OPENAPI_URL=${PLATFORM_OPENAPI_URL}`,
    `WACHT_PROJECT_ID=${context?.project_id ?? ''}`,
    `WACHT_DEPLOYMENT_ID=${context?.deployment_id ?? ''}`,
    `WACHT_DEPLOYMENT_MODE=${context?.deployment_mode ?? ''}`,
    `WACHT_BACKEND_HOST=${context?.deployment_backend_host ?? ''}`,
    `WACHT_FRONTEND_HOST=${context?.deployment_frontend_host ?? ''}`,
    '',
    '# Framework SDK keys. Fill the publishable key from your Wacht deployment.',
    'NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY=',
    'VITE_WACHT_PUBLISHABLE_KEY=',
    'WACHT_API_KEY=',
    '',
  ];
  await writeFile(envPath, lines.join('\n'), 'utf8');
  return envPath;
}

async function writeBootstrapGuide(root: string, profile: ProjectProfile): Promise<string> {
  const guidePath = path.join(root, '.wacht', 'BOOTSTRAP.md');
  await mkdir(path.dirname(guidePath), { recursive: true });
  const context = await readBenchContext();
  const checklist = frameworkChecklist(profile).map((item) => `- ${item}`).join('\n');
  const active = context
    ? `- Active project: ${context.project_name} (${context.project_id})
- Active deployment: ${context.deployment_mode} (${context.deployment_id})
- Backend host: ${context.deployment_backend_host ?? ''}
- Frontend host: ${context.deployment_frontend_host ?? ''}`
    : '- No active deployment selected. Run `wacht deployments select`.';

  const content = `# Wacht Bootstrap

## Project

- Detected frameworks: ${profile.frameworks.length ? profile.frameworks.join(', ') : 'unknown'}
- Package manager: ${profile.packageManager}
- Suggested skills: ${profile.suggestedSkills.join(', ')}

## Active Deployment

${active}

## Checklist

${checklist}

## Templates

Bench writes framework starter templates under \`.wacht/templates\`. These files are not integrated into the app automatically. Use the suggested Wacht skills and Docs MCP to adapt them to the existing project structure.

## Useful Commands

\`\`\`bash
npx skills add ${SKILLS_SOURCE}
wacht login
wacht deployments select
wacht deployments current
wacht api ls --search users
wacht api describe createUser
wacht api call createUser --body '{"email_address":"person@example.com"}'
\`\`\`

## API Discovery

Bench reads the Wacht Platform OpenAPI schema from:

\`\`\`text
${PLATFORM_OPENAPI_URL}
\`\`\`

Schema cache TTL is 24 hours. Refresh it with:

\`\`\`bash
wacht api schema refresh
\`\`\`
`;
  await writeFile(guidePath, content, 'utf8');
  return guidePath;
}

function nextProviderTemplate(): string {
  return `'use client';

/**
 * Template only. Bench does not import this file or patch your layout.
 * Adapt it with the wacht-nextjs-patterns skill after checking Docs MCP.
 */

import type { ReactNode } from 'react';
import { DeploymentInitialized, DeploymentProvider } from '@wacht/nextjs';

export function WachtProvider({ children }: { children: ReactNode }) {
  return (
    <DeploymentProvider publicKey={process.env.NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY!}>
      <DeploymentInitialized>{children}</DeploymentInitialized>
    </DeploymentProvider>
  );
}
`;
}

function nextMiddlewareTemplate(): string {
  return `/**
 * Template only. Bench does not install this file into the app.
 * For Next.js 16, adapt this into proxy.ts. For older Next.js, adapt into middleware.ts.
 */

import { NextResponse } from 'next/server';
import { createRouteMatcher, wachtMiddleware } from '@wacht/nextjs/server';

const isProtected = createRouteMatcher(['/account(.*)', '/dashboard(.*)']);

export default wachtMiddleware(
  async (auth, req) => {
    if (!isProtected(req)) return NextResponse.next();
    await auth.protect();
    return NextResponse.next();
  },
  { apiRoutePrefixes: ['/api', '/trpc'] },
);

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
`;
}

function reactProviderTemplate(adapterImport: string): string {
  return `/**
 * Template only. Bench does not import this file or patch your route root.
 * Adapt it with the framework skill after checking Docs MCP.
 */

import type { ReactNode } from 'react';
import { DeploymentProvider } from '${adapterImport}';

export function WachtDeploymentProvider({ children }: { children: ReactNode }) {
  return (
    <DeploymentProvider publicKey={import.meta.env.VITE_WACHT_PUBLISHABLE_KEY}>
      {children}
    </DeploymentProvider>
  );
}
`;
}

function reactRouterMiddlewareTemplate(): string {
  return `/**
 * Template only. Bench does not attach this loader to any route.
 * Adapt it with the wacht-react-router-patterns skill after checking Docs MCP.
 */

import { redirect, type LoaderFunctionArgs } from 'react-router';
import { authenticateRequest } from '@wacht/react-router/server';

export async function protectedLoader({ request }: LoaderFunctionArgs) {
  const result = await authenticateRequest(request);

  if (!result.auth.isAuthenticated) {
    throw redirect('/sign-in', { headers: result.headers });
  }

  return Response.json({ userId: result.auth.userId }, { headers: result.headers });
}
`;
}

function tanstackMiddlewareTemplate(): string {
  return `/**
 * Template only. Bench does not attach this helper to any route.
 * Adapt it with the wacht-tanstack-router-patterns skill after checking Docs MCP.
 */

import { authenticateRequest } from '@wacht/tanstack-router/server';

export async function getProtectedUserId(request: Request) {
  const result = await authenticateRequest(request);

  if (!result.auth.isAuthenticated) {
    throw new Response(null, {
      status: 302,
      headers: {
        ...Object.fromEntries(result.headers.entries()),
        Location: '/sign-in',
      },
    });
  }

  return result.auth.userId;
}
`;
}

function contractWrapperTemplate(profile: ProjectProfile): string {
  const framework = profile.frameworks[0] ?? 'unknown';
  return `/**
 * Wacht contract wrapper template.
 *
 * This file is generated for AI-assisted development. It is not imported
 * anywhere by Bench. Move/adapt it into a server-only module after reading
 * the active Wacht skill and Wacht Docs MCP pages for this framework.
 */

export type WachtRuntimeContract = {
  framework: string;
  deploymentId: string;
  deploymentMode: string;
  backendHost: string;
  frontendHost: string;
  openApiUrl: string;
};

export function readWachtRuntimeContract(env: Record<string, string | undefined> = process.env): WachtRuntimeContract {
  return {
    framework: '${framework}',
    deploymentId: env.WACHT_DEPLOYMENT_ID ?? '',
    deploymentMode: env.WACHT_DEPLOYMENT_MODE ?? '',
    backendHost: env.WACHT_BACKEND_HOST ?? '',
    frontendHost: env.WACHT_FRONTEND_HOST ?? '',
    openApiUrl: env.WACHT_OPENAPI_URL ?? '${PLATFORM_OPENAPI_URL}',
  };
}

export function assertWachtRuntimeContract(contract = readWachtRuntimeContract()): WachtRuntimeContract {
  const missing = Object.entries(contract)
    .filter(([key, value]) => key !== 'framework' && key !== 'openApiUrl' && !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(\`Missing Wacht runtime config: \${missing.join(', ')}\`);
  }

  return contract;
}
`;
}

async function writeTemplate(root: string, relativePath: string, content: string): Promise<string> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

async function writeStarterTemplates(root: string, profile: ProjectProfile): Promise<string[]> {
  const frameworks = new Set(profile.frameworks);
  const written: string[] = [];

  if (frameworks.has('Next.js')) {
    written.push(await writeTemplate(root, '.wacht/templates/nextjs/wacht-provider.tsx', nextProviderTemplate()));
    written.push(await writeTemplate(root, '.wacht/templates/nextjs/middleware.ts', nextMiddlewareTemplate()));
  } else if (frameworks.has('React Router')) {
    written.push(await writeTemplate(root, '.wacht/templates/react-router/wacht-provider.tsx', reactProviderTemplate('@wacht/react-router')));
    written.push(await writeTemplate(root, '.wacht/templates/react-router/protected-loader.ts', reactRouterMiddlewareTemplate()));
  } else if (frameworks.has('TanStack Router')) {
    written.push(await writeTemplate(root, '.wacht/templates/tanstack-router/wacht-provider.tsx', reactProviderTemplate('@wacht/tanstack-router')));
    written.push(await writeTemplate(root, '.wacht/templates/tanstack-router/protected-request.ts', tanstackMiddlewareTemplate()));
  }

  written.push(await writeTemplate(root, '.wacht/templates/wacht-contract.ts', contractWrapperTemplate(profile)));
  return written;
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

  if (!options.skipConfig) {
    written.push(await writeBenchConfig(root, profile, options));
  }

  if (!options.skipEnv) {
    written.push(await writeEnvTemplate(root));
  }

  if (!options.skipGuide) {
    written.push(await writeBootstrapGuide(root, profile));
  }

  if (!options.skipTemplates) {
    written.push(...await writeStarterTemplates(root, profile));
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
    await installSkills();
  } else {
    log(ctx, '');
    log(ctx, field('Skills', `run ${command(`npx skills add ${SKILLS_SOURCE}`)} when you want to install/update the pack`));
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
  log(ctx, `Next: ${command(`cd ${path.relative(process.cwd(), absoluteTarget) || '.'} && pnpm install && pnpm dev`)}`);
}

export function listStarters(): { framework: string; description: string; repo: string }[] {
  return Object.entries(STARTERS).map(([framework, info]) => ({ framework, description: info.description, repo: info.repo }));
}
