import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

/**
 * Validate a JSON request body against an operation's `requestBody` schema using
 * the cached OpenAPI spec. Returns `null` on success; an array of human-readable
 * error strings on failure.
 *
 * The validator handles OpenAPI 3.0 `nullable: true` (rewritten to JSON-Schema
 * `type: [..., "null"]`), `$ref` resolution against `components.schemas`, and
 * discriminated unions via `oneOf` + `discriminator`.
 */
export function validateBody(spec: unknown, schema: unknown, body: unknown): string[] | null {
  if (!isRecord(schema)) return null;
  const componentSchemas = readComponentSchemas(spec);
  const ajv = buildAjv(componentSchemas);
  const compiled = compileSafely(ajv, schema);
  if (!compiled) return null;
  if (compiled(body)) return null;
  return summariseErrors(compiled.errors ?? [], body);
}

// Collapse `oneOf` failures into one line per union and drop the noisy umbrella
// + `type: null` errors our `nullable` rewrite introduces.
function summariseErrors(rawErrors: readonly ErrorObject[], body: unknown): string[] {
  // Discover oneOf failure points by looking for the `oneOf` umbrella error.
  const oneOfPaths = new Set<string>();
  for (const e of rawErrors) {
    if (e.keyword === 'oneOf') oneOfPaths.add(e.instancePath);
  }

  const collapsed: string[] = [];
  const skip = new Set<ErrorObject>();
  for (const path of oneOfPaths) {
    const value = readJsonPointer(body, path);
    // The variant tag is conventionally `type`; if absent, just describe the path.
    const tag = isRecord(value) && typeof value.type === 'string'
      ? `, got type "${value.type}"`
      : '';
    collapsed.push(
      `${path || '(body root)'}: doesn't match any variant of the discriminated union${tag}. ` +
      `Run \`wacht api describe <operation>\` to see each variant's required fields.`,
    );
    // Drop every error at the union path; the user fixes the variant first.
    for (const e of rawErrors) {
      if (e.instancePath === path || e.instancePath.startsWith(path + '/')) skip.add(e);
    }
  }

  const out = [...collapsed];
  for (const e of rawErrors) {
    if (skip.has(e)) continue;
    if (e.keyword === 'anyOf' || e.keyword === 'oneOf') continue;
    if (e.keyword === 'type' && (e.params as { type?: unknown })?.type === 'null') continue;
    out.push(formatError(e));
  }
  // Dedupe identical lines (e.g. two variants both miss the same field).
  return [...new Set(out)];
}

function readJsonPointer(value: unknown, pointer: string): unknown {
  if (!pointer || pointer === '/') return value;
  const segments = pointer.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur: unknown = value;
  for (const seg of segments) {
    if (Array.isArray(cur)) {
      const idx = Number.parseInt(seg, 10);
      if (Number.isNaN(idx)) return undefined;
      cur = cur[idx];
    } else if (isRecord(cur)) {
      cur = cur[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function readComponentSchemas(spec: unknown): Record<string, unknown> {
  if (!isRecord(spec)) return {};
  const components = isRecord(spec.components) ? spec.components : undefined;
  const schemas = components && isRecord(components.schemas) ? components.schemas : undefined;
  return schemas ?? {};
}

function buildAjv(componentSchemas: Record<string, unknown>): Ajv {
  // OpenAPI 3.1 schemas are JSON Schema draft 2020-12, but the spec we generate
  // also leans on draft-7 `nullable: true` shorthand. Rewrite to draft-7 unions
  // and run Ajv permissively — we're validating user payloads, not enforcing
  // the spec itself.
  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    coerceTypes: false,
    allowUnionTypes: true,
    validateFormats: false,
  });

  // Make every component schema addressable by its $ref so nested references resolve.
  for (const [name, raw] of Object.entries(componentSchemas)) {
    const rewritten = rewriteNullable(raw);
    try {
      ajv.addSchema(rewritten as object, `#/components/schemas/${name}`);
    } catch {
      // Bad schemas shouldn't break the CLI — skip and keep going.
    }
  }
  return ajv;
}

function compileSafely(ajv: Ajv, schema: unknown): ValidateFunction | null {
  try {
    return ajv.compile(rewriteNullable(schema) as object);
  } catch {
    return null;
  }
}

/** Walk a schema and rewrite `{type: X, nullable: true}` → `{type: [X, "null"]}`. */
function rewriteNullable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteNullable);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  let nullable = false;
  for (const [key, v] of Object.entries(value)) {
    if (key === 'nullable' && v === true) { nullable = true; continue; }
    out[key] = rewriteNullable(v);
  }
  if (nullable && typeof out.type === 'string') {
    out.type = [out.type, 'null'];
  } else if (nullable && Array.isArray(out.type)) {
    if (!out.type.includes('null')) out.type = [...out.type, 'null'];
  } else if (nullable) {
    // No `type`; allow null alongside whatever shape the schema describes.
    out.anyOf = [{ ...out }, { type: 'null' }];
    for (const k of Object.keys(out)) if (k !== 'anyOf') delete out[k];
  }
  return out;
}

function formatError(err: ErrorObject): string {
  const path = err.instancePath || '(body root)';
  const reason = err.message ?? 'invalid';
  const extras = err.params ? formatParams(err.params) : '';
  return `${path}: ${reason}${extras}`;
}

function formatParams(params: Record<string, unknown>): string {
  // Skim the most useful bits — missingProperty, allowedValues — without
  // dumping every Ajv internal.
  const bits: string[] = [];
  if (typeof params.missingProperty === 'string') bits.push(`missing "${params.missingProperty}"`);
  if (Array.isArray(params.allowedValues)) bits.push(`allowed: ${params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}`);
  if (typeof params.additionalProperty === 'string') bits.push(`unknown property "${params.additionalProperty}"`);
  return bits.length ? ` (${bits.join('; ')})` : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
