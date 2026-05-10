import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import { AUTH_DIR, CONTEXT_FILE } from './config.js';
import type { StoredBenchContext } from './types.js';

function isStoredBenchContext(value: unknown): value is StoredBenchContext {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.project_id === 'string'
    && typeof record.project_name === 'string'
    && typeof record.deployment_id === 'string'
    && typeof record.deployment_mode === 'string'
    && typeof record.updated_at === 'number';
}

export async function readBenchContext(): Promise<StoredBenchContext | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(CONTEXT_FILE, 'utf8'));
    return isStoredBenchContext(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeBenchContext(context: StoredBenchContext): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true });
  await writeFile(CONTEXT_FILE, `${JSON.stringify(context, null, 2)}\n`, { mode: 0o600 });
}

export async function clearBenchContext(): Promise<void> {
  await rm(CONTEXT_FILE, { force: true });
}
