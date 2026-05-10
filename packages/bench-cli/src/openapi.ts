import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';

import { AUTH_DIR, OPENAPI_CACHE_FILE, PLATFORM_OPENAPI_URL } from './config.js';
import { readBenchContext } from './context-store.js';
import { entries, requestBody, type ApiOptions, machineRequest } from './machine-api.js';
import type { CliContext } from './types.js';
import { field, log, printBannerFor, printJson, section, warning } from './ui.js';

const OPENAPI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

type HttpMethod = typeof HTTP_METHODS[number];
type JsonRecord = Record<string, unknown>;

interface OpenApiSpec {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
  };
  paths?: Record<string, Record<string, OpenApiOperation | unknown>>;
  components?: JsonRecord;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
}

interface OpenApiParameter {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: JsonRecord;
}

interface OpenApiRequestBody {
  required?: boolean;
  content?: Record<string, { schema?: JsonRecord }>;
}

interface LoadedSpec {
  spec: OpenApiSpec;
  source: 'network' | 'cache' | 'cache-stale';
  cacheAgeMs?: number;
}

interface OperationEntry {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
  parameters: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
}

interface SchemaOptions {
  refresh?: boolean;
}

interface ListOptions extends SchemaOptions {
  tag?: string;
  search?: string;
}

interface DescribeOptions extends SchemaOptions {
}

interface CallOptions extends ApiOptions, SchemaOptions {
  param?: string[];
  deployment?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asSpec(value: unknown): OpenApiSpec {
  if (!isRecord(value) || !isRecord(value.paths)) {
    throw new Error('OpenAPI document is missing paths.');
  }
  return value as OpenApiSpec;
}

async function readCache(): Promise<LoadedSpec | null> {
  try {
    const [file, metadata] = await Promise.all([
      readFile(OPENAPI_CACHE_FILE, 'utf8'),
      stat(OPENAPI_CACHE_FILE),
    ]);
    const ageMs = Date.now() - metadata.mtimeMs;
    return {
      spec: asSpec(JSON.parse(file)),
      source: ageMs > OPENAPI_CACHE_TTL_MS ? 'cache-stale' : 'cache',
      cacheAgeMs: ageMs,
    };
  } catch {
    return null;
  }
}

async function fetchSpec(): Promise<OpenApiSpec> {
  const response = await fetch(PLATFORM_OPENAPI_URL);
  if (!response.ok) {
    throw new Error(`OpenAPI fetch failed: HTTP ${response.status}`);
  }
  return asSpec(await response.json());
}

export async function loadOpenApiSpec(ctx: CliContext, options: SchemaOptions = {}): Promise<LoadedSpec> {
  const cached = await readCache();
  if (cached && cached.source === 'cache' && !options.refresh) return cached;

  try {
    const spec = await fetchSpec();
    await mkdir(AUTH_DIR, { recursive: true });
    await writeFile(OPENAPI_CACHE_FILE, `${JSON.stringify(spec, null, 2)}\n`, { mode: 0o600 });
    return { spec, source: 'network', cacheAgeMs: 0 };
  } catch (error) {
    if (cached) {
      log(ctx, warning(`Using stale OpenAPI cache: ${error instanceof Error ? error.message : String(error)}`));
      return { ...cached, source: 'cache-stale' };
    }
    throw error;
  }
}

function operations(spec: OpenApiSpec): OperationEntry[] {
  const result: OperationEntry[] = [];
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!isRecord(pathItem)) continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!isRecord(operation)) continue;
      const typed = operation as OpenApiOperation;
      result.push({
        operationId: typed.operationId ?? `${method}_${path.replace(/[^a-zA-Z0-9]+/g, '_')}`,
        method: method.toUpperCase(),
        path,
        summary: typed.summary ?? '',
        tags: typed.tags ?? [],
        parameters: typed.parameters ?? [],
        requestBody: typed.requestBody,
      });
    }
  }
  return result.sort((a, b) => `${a.tags[0] ?? ''}:${a.path}:${a.method}`.localeCompare(`${b.tags[0] ?? ''}:${b.path}:${b.method}`));
}

function findOperation(spec: OpenApiSpec, target: string, maybePath?: string): OperationEntry | null {
  const all = operations(spec);
  if (maybePath) {
    const method = target.toUpperCase();
    return all.find((operation) => operation.method === method && operation.path === maybePath) ?? null;
  }

  const normalized = target.trim();
  const methodPath = normalized.match(/^([A-Za-z]+)\s+(.+)$/);
  if (methodPath) {
    return all.find((operation) => operation.method === methodPath[1].toUpperCase() && operation.path === methodPath[2]) ?? null;
  }

  return all.find((operation) => operation.operationId === normalized) ?? null;
}

function schemaType(schema: JsonRecord | undefined): string {
  if (!schema) return 'unknown';
  if (typeof schema.type === 'string') return schema.type;
  if (typeof schema.$ref === 'string') return schema.$ref.split('/').pop() ?? schema.$ref;
  if (Array.isArray(schema.anyOf)) return schema.anyOf.map((item) => isRecord(item) ? schemaType(item) : 'unknown').join(' | ');
  return 'object';
}

function requestContent(operation: OperationEntry): string[] {
  return Object.keys(operation.requestBody?.content ?? {});
}

function printSchemaSource(ctx: CliContext, loaded: LoadedSpec): void {
  const age = loaded.cacheAgeMs === undefined ? '' : ` (${Math.round(loaded.cacheAgeMs / 1000)}s old)`;
  log(ctx, field('Schema', `${loaded.source}${age}`));
}

export async function openApiList(ctx: CliContext, options: ListOptions): Promise<void> {
  const loaded = await loadOpenApiSpec(ctx, options);
  const all = operations(loaded.spec).filter((operation) => {
    const tagMatch = !options.tag || operation.tags.some((tag) => tag.toLowerCase() === options.tag?.toLowerCase());
    const search = options.search?.toLowerCase();
    const searchMatch = !search
      || operation.operationId.toLowerCase().includes(search)
      || operation.path.toLowerCase().includes(search)
      || operation.summary.toLowerCase().includes(search)
      || operation.tags.some((tag) => tag.toLowerCase().includes(search));
    return tagMatch && searchMatch;
  });

  if (ctx.json) {
    printJson({
      ok: true,
      schemaSource: loaded.source,
      count: all.length,
      operations: all,
    });
    return;
  }

  printBannerFor(ctx);
  log(ctx, section('API Operations'));
  printSchemaSource(ctx, loaded);
  log(ctx, field('Count', String(all.length)));
  log(ctx, '');
  for (const operation of all) {
    const tag = operation.tags[0] ? `[${operation.tags[0]}] ` : '';
    log(ctx, `${operation.method.padEnd(6)} ${operation.path.padEnd(58)} ${tag}${operation.operationId}`);
  }
}

export async function openApiDescribe(ctx: CliContext, target: string, maybePath: string | undefined, options: DescribeOptions): Promise<void> {
  const loaded = await loadOpenApiSpec(ctx, options);
  const operation = findOperation(loaded.spec, target, maybePath);
  if (!operation) {
    throw new Error('Operation not found. Use `wacht api ls` to find operation IDs and paths.');
  }

  if (ctx.json) {
    printJson({
      ok: true,
      schemaSource: loaded.source,
      operation,
      requestContentTypes: requestContent(operation),
    });
    return;
  }

  printBannerFor(ctx);
  log(ctx, section(operation.operationId));
  printSchemaSource(ctx, loaded);
  log(ctx, field('Method', operation.method));
  log(ctx, field('Path', operation.path));
  if (operation.summary) log(ctx, field('Summary', operation.summary));
  if (operation.tags.length) log(ctx, field('Tags', operation.tags.join(', ')));
  if (operation.parameters.length) {
    log(ctx, '');
    log(ctx, section('Parameters'));
    for (const parameter of operation.parameters) {
      const required = parameter.required ? 'required' : 'optional';
      log(ctx, `${parameter.name ?? 'unknown'} (${parameter.in ?? 'unknown'}, ${required}, ${schemaType(parameter.schema)})`);
    }
  }
  const contentTypes = requestContent(operation);
  if (contentTypes.length) {
    log(ctx, '');
    log(ctx, section('Request Body'));
    for (const contentType of contentTypes) log(ctx, contentType);
  }
}

function applyPathParams(path: string, params: Array<[string, string]>): string {
  let next = path;
  for (const [key, value] of params) {
    next = next.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  const missing = next.match(/{[^}]+}/g);
  if (missing) {
    throw new Error(`Missing path parameter(s): ${missing.map((item) => item.slice(1, -1)).join(', ')}. Pass --param key=value.`);
  }
  return next;
}

function appendQueryParams(path: string, params: Array<[string, string]>, operation: OperationEntry): string {
  const queryNames = new Set(operation.parameters.filter((parameter) => parameter.in === 'query').map((parameter) => parameter.name));
  const url = new URL(path, 'https://machine.local');
  for (const [key, value] of params) {
    if (queryNames.has(key)) {
      url.searchParams.set(key, value);
    }
  }
  return `${url.pathname}${url.search}`;
}

export async function openApiCall(ctx: CliContext, target: string, options: CallOptions): Promise<void> {
  const loaded = await loadOpenApiSpec(ctx, options);
  const operation = findOperation(loaded.spec, target);
  if (!operation) {
    throw new Error('Operation not found. Use `wacht api ls` to find operation IDs.');
  }

  const context = await readBenchContext();
  const deploymentId = options.deployment ?? context?.deployment_id;
  const params = entries(options.param, '--param');
  const apiOptions: ApiOptions = {
    body: options.body,
    field: options.field,
    form: options.form,
    file: options.file,
    header: options.header,
  };

  const pathWithParams = appendQueryParams(applyPathParams(operation.path, params), params, operation);
  const machinePath = pathWithParams.startsWith('/project') || pathWithParams === '/projects'
    ? pathWithParams
    : `/deployments/${deploymentId ?? ''}${pathWithParams}`;
  if (machinePath.includes('/deployments//')) {
    throw new Error('Select an active deployment first, or pass raw paths with `wacht api METHOD /path`.');
  }

  const { body, headers } = await requestBody(apiOptions);
  const data = await machineRequest(machinePath, {
    method: operation.method,
    body,
    headers,
  });

  if (ctx.json) {
    printJson({
      ok: true,
      schemaSource: loaded.source,
      operationId: operation.operationId,
      method: operation.method,
      path: machinePath,
      data,
    });
    return;
  }

  printJson(data);
}

export async function openApiRefresh(ctx: CliContext): Promise<void> {
  const loaded = await loadOpenApiSpec(ctx, { refresh: true });
  const count = operations(loaded.spec).length;
  if (ctx.json) {
    printJson({ ok: true, schemaSource: loaded.source, count, cacheFile: OPENAPI_CACHE_FILE });
    return;
  }
  printBannerFor(ctx);
  log(ctx, section('OpenAPI Schema'));
  log(ctx, field('Source', loaded.source));
  log(ctx, field('Operations', String(count)));
  log(ctx, field('Cache', OPENAPI_CACHE_FILE));
}
