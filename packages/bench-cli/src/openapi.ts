import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AUTH_DIR, OPENAPI_CACHE_FILE, PLATFORM_OPENAPI_URL } from './config.js';
import { readBenchContext } from './context-store.js';
import { httpFetch } from './http.js';
import { entries, requestBody, type ApiOptions, machineRequest } from './machine-api.js';
import { validateBody } from './openapi-validate.js';
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
  responses?: Record<string, OpenApiResponse>;
}

interface OpenApiResponse {
  description?: string;
  content?: Record<string, { schema?: JsonRecord }>;
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
  responses?: Record<string, OpenApiResponse>;
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
  /** Commander sets this to `false` when the user passes `--no-validate`. */
  validate?: boolean;
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
  const response = await httpFetch(PLATFORM_OPENAPI_URL);
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
        responses: typed.responses,
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
  if (typeof schema.type === 'string') {
    if (schema.type === 'array' && isRecord(schema.items)) {
      return `array<${schemaType(schema.items)}>`;
    }
    if (Array.isArray(schema.enum) && schema.enum.length) {
      return `${schema.type}<${schema.enum.map((v) => JSON.stringify(v)).join(' | ')}>`;
    }
    if (typeof schema.const === 'string') return `const "${schema.const}"`;
    // Surface common formats like `binary` (file uploads) so multipart fields
    // are recognisable at a glance vs plain strings.
    if (typeof schema.format === 'string') return `${schema.type} (${schema.format})`;
    return schema.type;
  }
  if (typeof schema.$ref === 'string') return schema.$ref.split('/').pop() ?? schema.$ref;
  if (Array.isArray(schema.anyOf)) return schema.anyOf.map((item) => isRecord(item) ? schemaType(item) : 'unknown').join(' | ');
  if (Array.isArray(schema.oneOf)) return schema.oneOf.map((item) => isRecord(item) ? schemaType(item) : 'unknown').join(' | ');
  if (schema.const !== undefined) return `const ${JSON.stringify(schema.const)}`;
  return 'object';
}

const REF_PREFIX = '#/components/schemas/';

function resolveSchemaRef(spec: OpenApiSpec, schema: JsonRecord | undefined, seen = new Set<string>()): JsonRecord | undefined {
  if (!schema) return undefined;
  if (typeof schema.$ref !== 'string') return schema;
  const name = schema.$ref.startsWith(REF_PREFIX) ? schema.$ref.slice(REF_PREFIX.length) : '';
  if (!name || seen.has(name)) return schema;
  const schemas = isRecord(spec.components) && isRecord(spec.components.schemas) ? spec.components.schemas : undefined;
  const target = schemas?.[name];
  if (!isRecord(target)) return schema;
  seen.add(name);
  return resolveSchemaRef(spec, target, seen);
}

/**
 * Merge an `allOf` chain into a single object schema. Used for our generator's
 * internally-tagged enum encoding: `allOf: [{$ref: Payload}, {properties: {<tag>: const}}]`.
 */
function flattenAllOf(spec: OpenApiSpec, schema: JsonRecord): JsonRecord {
  if (!Array.isArray(schema.allOf)) return schema;
  const props: Record<string, unknown> = {};
  const required = new Set<string>();
  for (const part of schema.allOf) {
    if (!isRecord(part)) continue;
    const resolved = resolveSchemaRef(spec, part) ?? part;
    if (isRecord(resolved.properties)) {
      for (const [key, value] of Object.entries(resolved.properties)) props[key] = value;
    }
    if (Array.isArray(resolved.required)) {
      for (const key of resolved.required) {
        if (typeof key === 'string') required.add(key);
      }
    }
  }
  return { type: 'object', properties: props, required: Array.from(required) };
}

/** How many levels of nested object schemas to inline before falling back to the type name. */
const MAX_BODY_DEPTH = 3;

interface PrintCtx {
  ctx: CliContext;
  spec: OpenApiSpec;
  seen: Set<string>;
}

/** Pull the schema-component name out of a `$ref`, if any. */
function refName(schema: JsonRecord | undefined): string | undefined {
  if (!schema || typeof schema.$ref !== 'string') return undefined;
  return schema.$ref.startsWith(REF_PREFIX) ? schema.$ref.slice(REF_PREFIX.length) : undefined;
}

/** True when a resolved schema carries structure worth expanding inline. */
function isStructural(schema: JsonRecord): boolean {
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf) || Array.isArray(schema.allOf)) return true;
  if (isRecord(schema.properties) && Object.keys(schema.properties).length > 0) return true;
  return false;
}

function printSchema(pctx: PrintCtx, raw: JsonRecord, indent: string, depth: number): void {
  // Stop recursing if we're already too deep — caller has shown the type name.
  if (depth > MAX_BODY_DEPTH) return;

  const name = refName(raw);
  if (name && pctx.seen.has(name)) {
    log(pctx.ctx, `${indent}(circular reference to ${name})`);
    return;
  }

  const resolved = resolveSchemaRef(pctx.spec, raw) ?? raw;
  const flat = Array.isArray(resolved.allOf) ? flattenAllOf(pctx.spec, resolved) : resolved;

  if (Array.isArray(flat.oneOf)) {
    if (depth >= MAX_BODY_DEPTH) {
      log(pctx.ctx, `${indent}(oneOf — drill further with \`wacht api describe ${name ?? '<schema>'}\`)`);
      return;
    }
    if (depth === 0) log(pctx.ctx, `${indent}(oneOf — pick exactly one variant)`);
    if (name) pctx.seen.add(name);
    for (const variant of flat.oneOf) {
      if (!isRecord(variant)) continue;
      const variantInner = resolveSchemaRef(pctx.spec, variant) ?? variant;
      const variantFlat = Array.isArray(variantInner.allOf) ? flattenAllOf(pctx.spec, variantInner) : variantInner;
      const variantProps = isRecord(variantFlat.properties) ? variantFlat.properties : {};
      const tagEntry = Object.entries(variantProps).find(
        ([, val]) => isRecord(val) && typeof val.const === 'string',
      );
      const label = tagEntry
        ? `variant "${(tagEntry[1] as JsonRecord).const}"`
        : 'variant';
      log(pctx.ctx, `${indent}  ${label}:`);
      printObjectFields(pctx, variantFlat, `${indent}    `, depth + 1);
    }
    if (name) pctx.seen.delete(name);
    return;
  }

  printObjectFields(pctx, flat, indent, depth);
}

function printObjectFields(pctx: PrintCtx, schema: JsonRecord, indent: string, depth: number): void {
  const expanded = Array.isArray(schema.allOf) ? flattenAllOf(pctx.spec, schema) : schema;
  const props = isRecord(expanded.properties) ? expanded.properties : {};
  const required = new Set(
    Array.isArray(expanded.required)
      ? expanded.required.filter((k): k is string => typeof k === 'string')
      : [],
  );

  if (Object.keys(props).length === 0) {
    log(pctx.ctx, `${indent}(no fields)`);
    return;
  }

  for (const [key, raw] of Object.entries(props)) {
    if (!isRecord(raw)) continue;
    const tag = required.has(key) ? 'required' : 'optional';
    const inlineType = schemaType(raw);
    log(pctx.ctx, `${indent}${key} (${tag}, ${inlineType})`);

    // Drill into nested structures one indent deeper, guarded by depth + cycle.
    if (depth >= MAX_BODY_DEPTH) continue;
    const target = refName(raw) ?? refName(isRecord(raw.items) ? raw.items : undefined);
    const nested = resolveSchemaRef(pctx.spec, raw) ?? raw;
    // Array element refs: descend into the items' resolved schema.
    const arrayItem = nested.type === 'array' && isRecord(nested.items)
      ? (resolveSchemaRef(pctx.spec, nested.items) ?? nested.items)
      : undefined;
    const next = arrayItem ?? nested;
    if (!isStructural(next)) continue;
    if (target && pctx.seen.has(target)) {
      log(pctx.ctx, `${indent}  (circular reference to ${target})`);
      continue;
    }
    if (target) pctx.seen.add(target);
    printSchema(pctx, next, `${indent}  `, depth + 1);
    if (target) pctx.seen.delete(target);
  }
}

function printBodySchema(ctx: CliContext, spec: OpenApiSpec, schema: JsonRecord | undefined): void {
  if (!schema) return;
  printSchema({ ctx, spec, seen: new Set() }, schema, '', 0);
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
    const required = operation.requestBody?.required ? ' (required)' : ' (optional)';
    for (const contentType of contentTypes) {
      log(ctx, `${contentType}${required}`);
      const bodySchema = operation.requestBody?.content?.[contentType]?.schema;
      if (!isRecord(bodySchema)) continue;
      // JSON, multipart, and url-encoded bodies all surface as object schemas
      // with `properties` once form annotations are in place; render uniformly.
      const isStructured =
        contentType === 'application/json'
        || contentType === 'multipart/form-data'
        || contentType === 'application/x-www-form-urlencoded';
      if (isStructured) {
        printBodySchema(ctx, loaded.spec, bodySchema);
      }
    }
  }

  if (operation.responses && Object.keys(operation.responses).length) {
    log(ctx, '');
    log(ctx, section('Responses'));
    const statuses = Object.keys(operation.responses).sort();
    for (const status of statuses) {
      const response = operation.responses[status];
      const description = response?.description ? ` — ${response.description}` : '';
      log(ctx, `${status}${description}`);
      // Only drill the 2xx success body; error responses share a common
      // `{errors: [{message, code}]}` envelope and just clutter the output.
      const isSuccess = status.startsWith('2');
      if (!isSuccess) continue;
      const successJson = response?.content?.['application/json']?.schema;
      if (isRecord(successJson)) {
        printBodySchema(ctx, loaded.spec, successJson);
      }
    }
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

  // Validate the JSON body against the operation's request schema first —
  // local check, useful regardless of deployment state. Skips multipart
  // (JSON Schema can't validate FormData) and anything not parseable as JSON.
  if (apiOptions.body && options.validate !== false) {
    const sourceBody = apiOptions.body.startsWith('@')
      ? await readFile(path.resolve(apiOptions.body.slice(1)), 'utf8')
      : apiOptions.body;
    let parsed: unknown;
    try { parsed = JSON.parse(sourceBody); } catch { parsed = undefined; }
    const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
    if (parsed !== undefined && bodySchema) {
      const errors = validateBody(loaded.spec, bodySchema, parsed);
      if (errors && errors.length) {
        log(ctx, warning(`Request body did not match schema for ${operation.operationId}:`));
        for (const e of errors) log(ctx, `  - ${e}`);
        log(ctx, '');
        log(ctx, `Pass --no-validate to skip local validation, or \`wacht api describe ${operation.operationId}\` to see the schema.`);
        throw new Error('Validation failed.');
      }
    }
  }

  const pathWithParams = appendQueryParams(applyPathParams(operation.path, params), params, operation);
  const isProjectScoped = pathWithParams.startsWith('/project') || pathWithParams === '/projects';
  let machinePath: string;
  if (isProjectScoped) {
    machinePath = pathWithParams;
  } else if (!deploymentId) {
    throw new Error('Select an active deployment first, or pass raw paths with `wacht api METHOD /path`.');
  } else {
    const base = `/deployments/${deploymentId}`;
    machinePath = pathWithParams === '/' ? base : `${base}${pathWithParams}`;
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
