import { readBenchContext } from './context-store.js';
import { entries, machineRequest, requestBody, type ApiOptions } from './machine-api.js';
import type { CliContext } from './types.js';
import { field, log, printBannerFor, printJson, section } from './ui.js';

interface ResourceListOptions {
  deployment?: string;
  limit?: string;
  offset?: string;
  search?: string;
}

interface ResourceCreateOptions extends ApiOptions {
  deployment?: string;
}

interface ResourceGetOptions {
  deployment?: string;
}

interface CollectionRequestOptions {
  query?: Record<string, string>;
}

async function deploymentScopedPath(pathname: string, override?: string): Promise<string> {
  const ctx = await readBenchContext();
  const deploymentId = override ?? ctx?.deployment_id;
  if (!deploymentId) {
    throw new Error('No active deployment. Run `wacht deployments select` or pass --deployment <id>.');
  }
  return `/deployments/${deploymentId}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

async function callDeployment(
  pathname: string,
  override: string | undefined,
  init: RequestInit & CollectionRequestOptions = {},
): Promise<unknown> {
  let resolved = await deploymentScopedPath(pathname, override);
  if (init.query) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined && value !== '') query.set(key, value);
    }
    const search = query.toString();
    if (search) resolved = `${resolved}?${search}`;
  }
  const { query: _query, ...rest } = init;
  return machineRequest(resolved, rest);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.items)) return value.items;
  }
  return [];
}

function pad(value: string, width: number): string {
  return value.padEnd(width, ' ');
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}~`;
}

function shortDate(value: unknown): string {
  if (typeof value !== 'string') return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

function printRows(
  ctx: CliContext,
  title: string,
  rows: Record<string, string>[],
  headers: { key: string; label: string; width?: number }[],
): void {
  printBannerFor(ctx);
  log(ctx, section(title));
  log(ctx, field('Count', String(rows.length)));
  log(ctx, '');
  if (rows.length === 0) {
    log(ctx, '(none)');
    return;
  }
  const widths = headers.map((h) =>
    Math.max(
      h.label.length,
      ...rows.map((row) => (row[h.key] ?? '').length),
      h.width ?? 0,
    ),
  );
  log(ctx, headers.map((h, i) => pad(h.label, widths[i])).join('  '));
  log(ctx, headers.map((_, i) => '-'.repeat(widths[i])).join('  '));
  for (const row of rows) {
    log(ctx, headers.map((h, i) => pad(row[h.key] ?? '', widths[i])).join('  '));
  }
}

// ─── Users ──────────────────────────────────────────────────────────

export async function listUsers(ctx: CliContext, options: ResourceListOptions): Promise<void> {
  const data = await callDeployment('/users', options.deployment, {
    method: 'GET',
    query: { limit: options.limit ?? '', offset: options.offset ?? '', search: options.search ?? '' },
  });
  const items = pickArray(data);
  if (ctx.json) {
    printJson({ ok: true, data });
    return;
  }
  const rows = items.filter(isRecord).map((u) => ({
    id: truncate(String(u.id ?? ''), 22),
    email: truncate(String(u.primary_email_address?.toString().includes('@') ? u.primary_email_address : (u.email ?? '-')), 32),
    name: truncate([u.first_name, u.last_name].filter(Boolean).join(' ') || '-', 24),
    created: shortDate(u.created_at),
  }))
  printRows(ctx, 'Users', rows, [
    { key: 'id', label: 'ID' },
    { key: 'email', label: 'Email' },
    { key: 'name', label: 'Name' },
    { key: 'created', label: 'Created' },
  ])
}

export async function getUser(ctx: CliContext, userId: string, options: ResourceGetOptions): Promise<void> {
  const data = await callDeployment(`/users/${encodeURIComponent(userId)}/details`, options.deployment, { method: 'GET' });
  if (ctx.json) {
    printJson({ ok: true, data });
    return;
  }
  printJson(data);
}

export async function createUser(ctx: CliContext, options: ResourceCreateOptions): Promise<void> {
  const path = await deploymentScopedPath('/users', options.deployment);
  const { body, headers } = await requestBody(options);
  const data = await machineRequest(path, { method: 'POST', body, headers });
  if (ctx.json) {
    printJson({ ok: true, data });
    return;
  }
  printJson(data);
}

// ─── Organizations ──────────────────────────────────────────────────

export async function listOrgs(ctx: CliContext, options: ResourceListOptions): Promise<void> {
  const data = await callDeployment('/organizations', options.deployment, {
    method: 'GET',
    query: { limit: options.limit ?? '', offset: options.offset ?? '', search: options.search ?? '' },
  });
  const items = pickArray(data);
  if (ctx.json) {
    printJson({ ok: true, data });
    return;
  }
  const rows = items.filter(isRecord).map((o) => ({
    id: truncate(String(o.id ?? ''), 22),
    name: truncate(String(o.name ?? '-'), 32),
    members: String(o.member_count ?? o.members_count ?? '-'),
    created: shortDate(o.created_at),
  }))
  printRows(ctx, 'Organizations', rows, [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'members', label: 'Members' },
    { key: 'created', label: 'Created' },
  ])
}

export async function getOrg(ctx: CliContext, orgId: string, options: ResourceGetOptions): Promise<void> {
  const data = await callDeployment(`/organizations/${encodeURIComponent(orgId)}`, options.deployment, { method: 'GET' });
  if (ctx.json) {
    printJson({ ok: true, data });
    return;
  }
  printJson(data);
}

export async function createOrg(ctx: CliContext, options: ResourceCreateOptions): Promise<void> {
  const path = await deploymentScopedPath('/organizations', options.deployment);
  const { body, headers } = await requestBody(options);
  const data = await machineRequest(path, { method: 'POST', body, headers });
  if (ctx.json) {
    printJson({ ok: true, data });
    return;
  }
  printJson(data);
}

// ─── Workspaces ─────────────────────────────────────────────────────

export async function listWorkspaces(ctx: CliContext, options: ResourceListOptions & { org?: string }): Promise<void> {
  const pathname = options.org
    ? `/organizations/${encodeURIComponent(options.org)}/workspaces`
    : '/workspaces';
  const data = await callDeployment(pathname, options.deployment, {
    method: 'GET',
    query: { limit: options.limit ?? '', offset: options.offset ?? '', search: options.search ?? '' },
  });
  const items = pickArray(data);
  if (ctx.json) {
    printJson({ ok: true, data });
    return;
  }
  const rows = items.filter(isRecord).map((w) => ({
    id: truncate(String(w.id ?? ''), 22),
    name: truncate(String(w.name ?? '-'), 28),
    org: truncate(String(w.organization_id ?? '-'), 22),
    created: shortDate(w.created_at),
  }))
  printRows(ctx, 'Workspaces', rows, [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'org', label: 'Org ID' },
    { key: 'created', label: 'Created' },
  ])
}

export async function getWorkspace(ctx: CliContext, workspaceId: string, options: ResourceGetOptions): Promise<void> {
  const data = await callDeployment(`/workspaces/${encodeURIComponent(workspaceId)}`, options.deployment, { method: 'GET' });
  if (ctx.json) {
    printJson({ ok: true, data });
    return;
  }
  printJson(data);
}

export async function createWorkspace(ctx: CliContext, options: ResourceCreateOptions & { org?: string }): Promise<void> {
  if (!options.org) {
    throw new Error('Workspaces are scoped to an organization. Pass --org <organization_id>.');
  }
  const path = await deploymentScopedPath(
    `/organizations/${encodeURIComponent(options.org)}/workspaces`,
    options.deployment,
  );
  const { body, headers } = await requestBody(options);
  const data = await machineRequest(path, { method: 'POST', body, headers });
  if (ctx.json) {
    printJson({ ok: true, data });
    return;
  }
  printJson(data);
}

// re-exported for ergonomics
export { entries };
