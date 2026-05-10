import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import { AUTH_DIR, AUTH_FILE } from './config.js';
import { isStoredAuth } from './guards.js';
import type { StoredAuth } from './types.js';

export async function readAuth(): Promise<StoredAuth | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(AUTH_FILE, 'utf8'));
    return isStoredAuth(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeAuth(auth: StoredAuth): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true });
  await writeFile(AUTH_FILE, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
}

export async function clearAuth(): Promise<void> {
  await rm(AUTH_FILE, { force: true });
}
