import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { MACHINE_API_URL } from './config.js';
import { readBenchContext } from './context-store.js';
import { getValidAuth } from './oauth.js';
import { promptChoice, promptOptionalList, promptText } from './prompts.js';
import type { CliContext } from './types.js';
import { field, log, printBannerFor, printJson, section } from './ui.js';

function isProjectScopedPath(p: string): boolean {
  if (p === '/projects' || p === '/project') return true;
  if (p.startsWith('/projects/') || p.startsWith('/project/')) return true;
  return false;
}

function isAlreadyDeploymentScoped(p: string): boolean {
  return p === '/deployments' || p.startsWith('/deployments/');
}

async function applyDeploymentPrefix(pathname: string): Promise<string> {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (isProjectScopedPath(normalized) || isAlreadyDeploymentScoped(normalized)) {
    return normalized;
  }
  const context = await readBenchContext();
  if (!context?.deployment_id) {
    throw new Error('No active deployment selected. Run `wacht deployments select`.');
  }
  const splitIdx = normalized.search(/[?#]/);
  const prefix = `/deployments/${context.deployment_id}`;
  const pathPart = splitIdx === -1 ? normalized : normalized.slice(0, splitIdx);
  const suffix = splitIdx === -1 ? '' : normalized.slice(splitIdx);
  const joinedPath = pathPart === '/' ? prefix : `${prefix}${pathPart}`;
  return `${joinedPath}${suffix}`;
}

export async function machineRequest(pathname: string, options: RequestInit = {}): Promise<unknown> {
  const auth = await getValidAuth();
  const resolvedPath = await applyDeploymentPrefix(pathname);
  const url = new URL(resolvedPath, auth.machine_api_url || MACHINE_API_URL);
  const headers = new Headers(options.headers);
  headers.set('authorization', `Bearer ${auth.access_token}`);
  headers.set('accept', 'application/json');

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Machine API request failed: HTTP ${response.status}${text ? ` ${text}` : ''}`);
  }

  if (!text) return null;
  return JSON.parse(text);
}

export interface ApiOptions {
  body?: string;
  field?: string[];
  form?: string[];
  file?: string[];
  header?: string[];
}

export interface DeploymentSummary {
  id: string;
  mode: string;
  backend_host?: string;
  frontend_host?: string;
  updated_at?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  deployments: number;
  deployment_modes: string[];
  deployment_items: DeploymentSummary[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function projectList(response: unknown): ProjectSummary[] {
  const rawProjects = Array.isArray(response)
    ? response
    : isRecord(response) && Array.isArray(response.data)
      ? response.data
      : [];

  return rawProjects.filter(isRecord).map((project) => {
    const deploymentItems = Array.isArray(project.deployments)
      ? project.deployments
        .filter(isRecord)
        .map((deployment) => ({
          id: String(deployment.id ?? ''),
          mode: typeof deployment.mode === 'string' ? deployment.mode : 'unknown',
          backend_host: typeof deployment.backend_host === 'string' ? deployment.backend_host : undefined,
          frontend_host: typeof deployment.frontend_host === 'string' ? deployment.frontend_host : undefined,
          updated_at: typeof deployment.updated_at === 'string' ? deployment.updated_at : undefined,
        }))
      : [];

    return {
      id: String(project.id ?? ''),
      name: String(project.name ?? 'Untitled project'),
      created_at: typeof project.created_at === 'string' ? project.created_at : undefined,
      updated_at: typeof project.updated_at === 'string' ? project.updated_at : undefined,
      deployments: deploymentItems.length,
      deployment_modes: deploymentItems.map((deployment) => deployment.mode),
      deployment_items: deploymentItems,
    };
  });
}

function shortDate(value: string | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}~`;
}

function pad(value: string, width: number): string {
  return value.padEnd(width, ' ');
}

function printProjectTable(ctx: CliContext, projects: ProjectSummary[]): void {
  printBannerFor(ctx);
  log(ctx, section('Projects'));
  log(ctx, field('Count', String(projects.length)));
  log(ctx, '');

  if (!projects.length) {
    log(ctx, 'No projects found for this OAuth grant.');
    return;
  }

  const rows = projects.map((project) => ({
    name: truncate(project.name, 32),
    id: truncate(project.id, 22),
    deployments: project.deployment_modes.length
      ? project.deployment_modes.join(', ')
      : String(project.deployments),
    updated: shortDate(project.updated_at),
  }));
  const nameWidth = Math.max('Name'.length, ...rows.map((row) => row.name.length));
  const idWidth = Math.max('ID'.length, ...rows.map((row) => row.id.length));
  const deploymentWidth = Math.max('Deployments'.length, ...rows.map((row) => row.deployments.length));

  log(ctx, `${pad('Name', nameWidth)}  ${pad('ID', idWidth)}  ${pad('Deployments', deploymentWidth)}  Updated`);
  log(ctx, `${'-'.repeat(nameWidth)}  ${'-'.repeat(idWidth)}  ${'-'.repeat(deploymentWidth)}  ----------`);
  for (const row of rows) {
    log(ctx, `${pad(row.name, nameWidth)}  ${pad(row.id, idWidth)}  ${pad(row.deployments, deploymentWidth)}  ${row.updated}`);
  }
}

export async function listProjects(ctx: CliContext): Promise<void> {
  const response = await machineRequest('/projects');
  const projects = projectList(response);
  if (ctx.json) {
    printJson({
      ok: true,
      data: projects,
      has_more: isRecord(response) && typeof response.has_more === 'boolean' ? response.has_more : undefined,
    });
    return;
  }
  printProjectTable(ctx, projects);
}

export async function getProjects(): Promise<ProjectSummary[]> {
  return projectList(await machineRequest('/projects'));
}

export async function createProject(name: string, methods: string[]): Promise<ProjectSummary> {
  const form = new FormData();
  form.append('name', name);
  for (const method of methods) {
    form.append('methods', method);
  }
  const response = await machineRequest('/project', {
    method: 'POST',
    body: form,
  });
  const projects = projectList([response]);
  if (!projects[0]) {
    throw new Error('Machine API returned an unexpected project response.');
  }
  return projects[0];
}

export async function createDeployment(projectId: string, mode: string, methods: string[], customDomain?: string): Promise<DeploymentSummary> {
  if (mode !== 'staging' && mode !== 'production') {
    throw new Error('Deployment mode must be staging or production.');
  }
  const body = mode === 'production'
    ? { custom_domain: customDomain, auth_methods: methods }
    : { auth_methods: methods };
  const response = await machineRequest(`/project/${projectId}/${mode}-deployment`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!isRecord(response)) {
    throw new Error('Machine API returned an unexpected deployment response.');
  }
  return {
    id: String(response.id ?? ''),
    mode: typeof response.mode === 'string' ? response.mode : mode,
    backend_host: typeof response.backend_host === 'string' ? response.backend_host : undefined,
    frontend_host: typeof response.frontend_host === 'string' ? response.frontend_host : undefined,
    updated_at: typeof response.updated_at === 'string' ? response.updated_at : undefined,
  };
}

export function entries(values: string[] | undefined, flag: string): Array<[string, string]> {
  return (values ?? []).map((value) => {
    const index = value.indexOf('=');
    if (index <= 0) {
      throw new Error(`${flag} expects key=value`);
    }
    return [value.slice(0, index), value.slice(index + 1)];
  });
}

function stripFileMarker(value: string): string {
  return value.startsWith('@') ? value.slice(1) : value;
}

function hasAny(values: string[] | undefined): boolean {
  return !!values && values.length > 0;
}

function explicitBodyKind(options: ApiOptions): string | null {
  if (options.body) return 'json';
  if (hasAny(options.file) || hasAny(options.form)) return 'multipart';
  if (hasAny(options.field)) return 'urlencoded';
  return null;
}

async function resolveApiOptions(
  method: string | undefined,
  pathname: string | undefined,
  options: ApiOptions,
  ctx: CliContext,
): Promise<{ method: string; pathname: string; options: ApiOptions }> {
  const wizard = !method || !pathname;
  const resolvedMethod = method
    ? method.toUpperCase()
    : (await promptChoice(
      ctx,
      undefined,
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      'HTTP method: ',
      'Pass an HTTP method, for example `wacht api GET /projects`.',
    )).toUpperCase();
  const resolvedPath = await promptText(ctx, pathname, 'API path: ', 'Pass an API path, for example `/projects`.');
  const headers = options.header && options.header.length
    ? options.header
    : wizard
      ? await promptOptionalList(ctx, undefined, 'Headers, comma separated key=value: ')
      : [];
  const nextOptions: ApiOptions = { ...options, header: headers };

  if (explicitBodyKind(nextOptions) || resolvedMethod === 'GET' || resolvedMethod === 'HEAD') {
    return { method: resolvedMethod, pathname: resolvedPath, options: nextOptions };
  }

  const bodyKind = await promptChoice(
    ctx,
    undefined,
    ['none', 'json', 'urlencoded', 'multipart'],
    'Request body type: ',
    'Pass --body, --field, --form, or --file for request bodies.',
  );

  if (bodyKind === 'json') {
    nextOptions.body = await promptText(ctx, undefined, 'JSON body: ', 'Pass --body <json>.');
  } else if (bodyKind === 'urlencoded') {
    nextOptions.field = await promptOptionalList(ctx, undefined, 'URL-encoded fields, comma separated key=value: ');
  } else if (bodyKind === 'multipart') {
    nextOptions.form = await promptOptionalList(ctx, undefined, 'Multipart text fields, comma separated key=value: ');
    nextOptions.file = await promptOptionalList(ctx, undefined, 'Multipart file fields, comma separated key=path or key=@path: ');
  }

  return { method: resolvedMethod, pathname: resolvedPath, options: nextOptions };
}

export async function requestBody(options: ApiOptions): Promise<{ body?: NonNullable<RequestInit['body']>; headers: Headers }> {
  const headers = new Headers();

  for (const [key, value] of entries(options.header, '--header')) {
    headers.set(key, value);
  }

  if (options.body) {
    // `--body @path/to/file.json` reads the JSON from disk so prompt files and
    // larger configuration blobs don't have to be inlined in the shell.
    let source = options.body;
    if (source.startsWith('@')) {
      const filePath = path.resolve(source.slice(1));
      source = await readFile(filePath, 'utf8');
    }
    headers.set('content-type', 'application/json');
    return {
      body: JSON.stringify(JSON.parse(source)),
      headers,
    };
  }

  const files = entries(options.file, '--file');
  const rawMultipartFields = entries(options.form, '--form');
  const multipartFields = rawMultipartFields.filter(([, value]) => !value.startsWith('@'));
  const multipartFiles = [
    ...files,
    ...rawMultipartFields.filter(([, value]) => value.startsWith('@')),
  ];
  if (multipartFiles.length || multipartFields.length) {
    const form = new FormData();
    for (const [key, value] of multipartFields) {
      form.append(key, value);
    }
    for (const [key, filePath] of multipartFiles) {
      const absolutePath = path.resolve(stripFileMarker(filePath));
      const bytes = await readFile(absolutePath);
      form.append(key, new Blob([bytes]), path.basename(absolutePath));
    }
    return { body: form, headers };
  }

  const fields = entries(options.field, '--field');
  if (fields.length) {
    headers.set('content-type', 'application/x-www-form-urlencoded');
    return {
      body: new URLSearchParams(fields),
      headers,
    };
  }

  return { headers };
}

export async function apiCommand(method: string | undefined, pathname: string | undefined, options: ApiOptions, ctx: CliContext): Promise<void> {
  const resolved = await resolveApiOptions(method, pathname, options, ctx);
  const { body, headers } = await requestBody(resolved.options);
  const data = await machineRequest(resolved.pathname, {
    method: resolved.method,
    body,
    headers,
  });

  if (ctx.json) {
    printJson({
      ok: true,
      method: resolved.method,
      path: resolved.pathname,
      data,
    });
    return;
  }

  if (typeof data === 'string') {
    console.log(data);
  } else {
    printJson(data);
  }
}
