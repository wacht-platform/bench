import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { machineRequest } from './machine-api.js';
import { detectProject } from './project-detect.js';
import type { CliContext } from './types.js';
import { field, log, printBannerFor, printJson, section } from './ui.js';

interface CredentialsResponse {
  publishable_key: string;
  frontend_host: string;
  backend_host: string;
  api_key: {
    id: string;
    secret: string;
    prefix: string;
    suffix: string;
    app_slug: string;
  };
}

export interface EnvPullOptions {
  file?: string;
  print?: boolean;
}

function isCredentialsResponse(value: unknown): value is CredentialsResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.publishable_key !== 'string') return false;
  if (typeof v.frontend_host !== 'string') return false;
  if (typeof v.backend_host !== 'string') return false;
  if (typeof v.api_key !== 'object' || v.api_key === null) return false;
  const k = v.api_key as Record<string, unknown>;
  return typeof k.secret === 'string';
}

function publishableKeyVar(frameworks: Set<string>): string {
  if (frameworks.has('Next.js')) return 'NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY';
  if (frameworks.has('React Router') || frameworks.has('TanStack Router')) {
    return 'VITE_WACHT_PUBLISHABLE_KEY';
  }
  return 'NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY';
}

function upsertEnvLines(existing: string, updates: Record<string, string>): string {
  const lines = existing.length === 0 ? [] : existing.split(/\r?\n/);
  const matched = new Set<string>();

  const next = lines.map((line) => {
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) return line;
    const key = line.slice(0, eqIdx).trim();
    if (!(key in updates)) return line;
    matched.add(key);
    return `${key}=${updates[key]}`;
  });

  const missing = Object.entries(updates).filter(([key]) => !matched.has(key));
  if (missing.length) {
    if (next.length && next[next.length - 1].trim() !== '') next.push('');
    for (const [key, value] of missing) next.push(`${key}=${value}`);
  }

  let out = next.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

export async function envPull(ctx: CliContext, options: EnvPullOptions = {}): Promise<void> {
  const data = await machineRequest('/credentials', { method: 'POST' });
  if (!isCredentialsResponse(data)) {
    throw new Error('Unexpected response shape from /credentials.');
  }

  if (options.print || ctx.json) {
    if (ctx.json) {
      printJson({ ok: true, data });
    } else {
      printBannerFor(ctx);
      log(ctx, section('Deployment Credentials'));
      log(ctx, field('Publishable key', data.publishable_key));
      log(ctx, field('API key', data.api_key.secret));
      log(ctx, field('API key suffix', `${data.api_key.prefix}…${data.api_key.suffix}`));
      log(ctx, field('Frontend host', data.frontend_host));
      log(ctx, field('Backend host', data.backend_host));
    }
    return;
  }

  const root = process.cwd();
  const profile = await detectProject(root);
  const frameworks = new Set(profile.frameworks);
  const pubVar = publishableKeyVar(frameworks);

  // Vite-based frameworks read `.env`; Next.js reads `.env.local`.
  const defaultFile = frameworks.has('React Router') || frameworks.has('TanStack Router')
    ? '.env'
    : '.env.local';
  const filePath = options.file
    ? path.resolve(root, options.file)
    : path.join(root, defaultFile);

  const existing = await readFile(filePath, 'utf8').catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return '';
    throw err;
  });

  const updated = upsertEnvLines(existing, {
    [pubVar]: data.publishable_key,
    WACHT_API_KEY: data.api_key.secret,
  });

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, updated, 'utf8');

  printBannerFor(ctx);
  log(ctx, section('Wrote credentials'));
  log(ctx, field('File', path.relative(root, filePath) || filePath));
  log(ctx, field(pubVar, `${data.publishable_key.slice(0, 12)}…`));
  log(ctx, field('WACHT_API_KEY', `${data.api_key.prefix}…${data.api_key.suffix}`));
  log(ctx, field('Frontend host', data.frontend_host));
  log(ctx, field('Backend host', data.backend_host));
  log(ctx, '');
  log(ctx, 'Note: the API key secret is only shown once. Subsequent calls mint a new key.');
}
