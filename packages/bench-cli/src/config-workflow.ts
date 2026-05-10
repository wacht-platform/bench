import { readFile, writeFile } from 'node:fs/promises';

import { PLATFORM_OPENAPI_URL } from './config.js';
import { readBenchContext } from './context-store.js';
import { machineRequest } from './machine-api.js';
import { loadOpenApiSpec } from './openapi.js';
import type { CliContext } from './types.js';
import { field, log, printBannerFor, printJson, section, success, warning } from './ui.js';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

interface WachtConfigFile {
  $schema?: string;
  version: 1;
  deployment?: {
    id?: string;
    mode?: string;
    project_id?: string;
    project_name?: string;
  };
  settings: {
    auth?: JsonObject;
    display?: JsonObject;
    b2b?: JsonObject;
    restrictions?: JsonObject;
  };
}

interface ConfigOptions {
  file?: string;
  deployment?: string;
  dryRun?: boolean;
  yes?: boolean;
  production?: boolean;
  confirm?: string;
  refresh?: boolean;
}

interface ConfigChange {
  section: string;
  path: string;
  before: JsonValue | undefined;
  after: JsonValue | undefined;
}

const DEFAULT_CONFIG_FILE = 'wacht.config.json';
const CONFIG_SCHEMA_URL = 'https://wacht.dev/schemas/wacht.config.schema.json';
const METADATA_KEYS = new Set(['id', 'deployment_id', 'created_at', 'updated_at', 'deleted_at']);
const SETTINGS_SECTIONS = ['auth', 'display', 'b2b', 'restrictions'] as const;
const AUTH_UPDATE_KEYS = new Set([
  'email',
  'phone',
  'username',
  'password',
  'name',
  'authentication_factors',
  'second_factor_policy',
  'first_factor',
  'backup_code',
  'web3_wallet',
  'multi_session_support',
  'session_token_lifetime',
  'session_validity_period',
  'session_inactive_timeout',
]);
const DISPLAY_UPDATE_KEYS = new Set([
  'app_name',
  'tos_page_url',
  'sign_in_page_url',
  'sign_up_page_url',
  'after_sign_out_one_page_url',
  'after_sign_out_all_page_url',
  'favicon_image_url',
  'logo_image_url',
  'privacy_policy_url',
  'signup_terms_statement',
  'signup_terms_statement_shown',
  'light_mode_settings',
  'dark_mode_settings',
  'after_logo_click_url',
  'organization_profile_url',
  'create_organization_url',
  'default_user_profile_image_url',
  'default_organization_profile_image_url',
  'default_workspace_profile_image_url',
  'use_initials_for_user_profile_image',
  'use_initials_for_organization_profile_image',
  'after_signup_redirect_url',
  'after_signin_redirect_url',
  'user_profile_url',
  'after_create_organization_redirect_url',
  'waitlist_page_url',
  'support_page_url',
]);
const B2B_UPDATE_KEYS = new Set([
  'organizations_enabled',
  'workspaces_enabled',
  'ip_allowlist_per_org_enabled',
  'ip_allowlist_per_workspace_enabled',
  'enforce_mfa_per_org_enabled',
  'enforce_mfa_per_workspace_enabled',
  'enterprise_sso_enabled',
  'allow_users_to_create_orgs',
  'max_allowed_org_members',
  'max_allowed_workspace_members',
  'allow_org_deletion',
  'allow_workspace_deletion',
  'custom_org_role_enabled',
  'custom_workspace_role_enabled',
  'default_workspace_creator_role_id',
  'default_workspace_member_role_id',
  'default_org_creator_role_id',
  'default_org_member_role_id',
  'limit_org_creation_per_user',
  'limit_workspace_creation_per_org',
  'org_creation_per_user_count',
  'workspaces_per_org_count',
  'workspace_permissions',
  'organization_permissions',
  'workspace_permission_catalog',
  'organization_permission_catalog',
]);
const RESTRICTIONS_UPDATE_KEYS = new Set([
  'allowlist_enabled',
  'blocklist_enabled',
  'block_subaddresses',
  'block_disposable_emails',
  'block_voip_numbers',
  'country_restrictions',
  'banned_keywords',
  'allowlisted_resources',
  'blocklisted_resources',
  'sign_up_mode',
  'waitlist_collect_names',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asJsonObject(value: unknown, label: string): JsonObject {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value as JsonObject;
}

function removeMetadata(value: unknown): JsonObject {
  const source = asJsonObject(value ?? {}, 'settings section');
  const next: JsonObject = {};
  for (const [key, entry] of Object.entries(source)) {
    if (!METADATA_KEYS.has(key)) next[key] = entry as JsonValue;
  }
  return next;
}

function pickKeys(value: unknown, allowed: Set<string>): JsonObject {
  const source = removeMetadata(value);
  const next: JsonObject = {};
  for (const [key, entry] of Object.entries(source)) {
    if (allowed.has(key)) next[key] = entry;
  }
  return next;
}

function validateKeys(sectionName: string, value: JsonObject | undefined, allowed: Set<string>): JsonObject | undefined {
  if (!value) return undefined;
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    throw new Error(`Unsupported settings.${sectionName} key(s): ${unsupported.join(', ')}.`);
  }
  return value;
}

function authToPatch(value: unknown): JsonObject | undefined {
  if (!isRecord(value)) return undefined;
  const auth = removeMetadata(value);
  const next: JsonObject = {};

  if (auth.email_address !== undefined) next.email = auth.email_address;
  if (auth.phone_number !== undefined) next.phone = auth.phone_number;
  if (auth.username !== undefined) next.username = auth.username;
  if (auth.password !== undefined) next.password = auth.password;
  if (auth.backup_code !== undefined) next.backup_code = auth.backup_code;
  if (auth.web3_wallet !== undefined) next.web3_wallet = auth.web3_wallet;
  if (auth.first_name !== undefined || auth.last_name !== undefined) {
    const first = isRecord(auth.first_name) ? auth.first_name : {};
    const last = isRecord(auth.last_name) ? auth.last_name : {};
    next.name = {
      first_name_enabled: first.enabled as JsonValue,
      first_name_required: first.required as JsonValue,
      last_name_enabled: last.enabled as JsonValue,
      last_name_required: last.required as JsonValue,
    };
  }
  if (auth.auth_factors_enabled !== undefined || auth.magic_link !== undefined || auth.passkey !== undefined) {
    const factors = isRecord(auth.auth_factors_enabled) ? auth.auth_factors_enabled : {};
    next.authentication_factors = {
      email_password_enabled: factors.email_password as JsonValue,
      username_password_enabled: factors.username_password as JsonValue,
      sso_enabled: factors.sso as JsonValue,
      web3_wallet_enabled: factors.web3_wallet as JsonValue,
      email_otp_enabled: factors.email_otp as JsonValue,
      phone_otp_enabled: factors.phone_otp as JsonValue,
      second_factor_authenticator_enabled: factors.authenticator as JsonValue,
      second_factor_backup_code_enabled: factors.backup_code as JsonValue,
      magic_link: auth.magic_link,
      passkey: auth.passkey,
    };
  }

  for (const key of ['second_factor_policy', 'first_factor', 'multi_session_support', 'session_token_lifetime', 'session_validity_period', 'session_inactive_timeout']) {
    if (auth[key] !== undefined) next[key] = auth[key];
  }

  return pruneUndefined(next);
}

function pruneUndefined<T extends JsonValue | undefined>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => pruneUndefined(item)).filter((item) => item !== undefined) as T;
  }
  if (isRecord(value)) {
    const next: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      const pruned = pruneUndefined(entry as JsonValue | undefined);
      if (pruned !== undefined) next[key] = pruned;
    }
    return next as T;
  }
  return value;
}

function configFromDeployment(deployment: unknown, fallback: { id?: string; mode?: string; project_id?: string; project_name?: string }): WachtConfigFile {
  const source = asJsonObject(deployment, 'deployment settings response');
  const settings: WachtConfigFile['settings'] = {};
  const auth = authToPatch(source.auth_settings);
  if (auth && Object.keys(auth).length) settings.auth = auth;
  if (source.ui_settings !== undefined) settings.display = removeMetadata(source.ui_settings);
  if (source.b2b_settings !== undefined) settings.b2b = pickKeys(source.b2b_settings, B2B_UPDATE_KEYS);
  if (source.restrictions !== undefined) settings.restrictions = removeMetadata(source.restrictions);

  return {
    $schema: CONFIG_SCHEMA_URL,
    version: 1,
    deployment: {
      id: String(source.id ?? fallback.id ?? ''),
      mode: typeof source.mode === 'string' ? source.mode : fallback.mode,
      project_id: fallback.project_id,
      project_name: fallback.project_name,
    },
    settings,
  };
}

function normalizeConfig(value: unknown): WachtConfigFile {
  const source = asJsonObject(value, 'config file');
  if (source.version !== 1) throw new Error('Config file version must be 1.');
  const settings = asJsonObject(source.settings, 'config settings');
  const unknown = Object.keys(settings).filter((key) => !SETTINGS_SECTIONS.includes(key as typeof SETTINGS_SECTIONS[number]));
  if (unknown.length) {
    throw new Error(`Unsupported config section(s): ${unknown.join(', ')}.`);
  }
  return {
    $schema: typeof source.$schema === 'string' ? source.$schema : CONFIG_SCHEMA_URL,
    version: 1,
    deployment: isRecord(source.deployment) ? {
      id: typeof source.deployment.id === 'string' ? source.deployment.id : undefined,
      mode: typeof source.deployment.mode === 'string' ? source.deployment.mode : undefined,
      project_id: typeof source.deployment.project_id === 'string' ? source.deployment.project_id : undefined,
      project_name: typeof source.deployment.project_name === 'string' ? source.deployment.project_name : undefined,
    } : undefined,
    settings: {
      auth: validateKeys('auth', settings.auth === undefined ? undefined : pruneUndefined(asJsonObject(settings.auth, 'settings.auth')), AUTH_UPDATE_KEYS),
      display: validateKeys('display', settings.display === undefined ? undefined : pruneUndefined(asJsonObject(settings.display, 'settings.display')), DISPLAY_UPDATE_KEYS),
      b2b: validateKeys('b2b', settings.b2b === undefined ? undefined : pruneUndefined(asJsonObject(settings.b2b, 'settings.b2b')), B2B_UPDATE_KEYS),
      restrictions: validateKeys('restrictions', settings.restrictions === undefined ? undefined : pruneUndefined(asJsonObject(settings.restrictions, 'settings.restrictions')), RESTRICTIONS_UPDATE_KEYS),
    },
  };
}

function sorted(value: JsonValue | undefined): JsonValue | undefined {
  if (Array.isArray(value)) return value.map((item) => sorted(item) as JsonValue);
  if (isRecord(value)) {
    const next: JsonObject = {};
    for (const key of Object.keys(value).sort()) {
      next[key] = sorted(value[key] as JsonValue) as JsonValue;
    }
    return next;
  }
  return value;
}

function jsonEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

function diffValues(section: string, path: string, before: JsonValue | undefined, after: JsonValue | undefined, changes: ConfigChange[]): void {
  if (jsonEqual(before, after)) return;
  if (isRecord(before) && isRecord(after) && !Array.isArray(before) && !Array.isArray(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      diffValues(section, path ? `${path}.${key}` : key, before[key] as JsonValue | undefined, after[key] as JsonValue | undefined, changes);
    }
    return;
  }
  changes.push({ section, path, before, after });
}

function diffConfigs(current: WachtConfigFile, desired: WachtConfigFile): ConfigChange[] {
  const changes: ConfigChange[] = [];
  for (const sectionName of SETTINGS_SECTIONS) {
    diffValues(sectionName, sectionName, current.settings[sectionName], desired.settings[sectionName], changes);
  }
  return changes;
}

function sectionChanges(changes: ConfigChange[]): string[] {
  return [...new Set(changes.map((change) => change.section))];
}

function configSchema(openApiSchemas: JsonObject = {}): JsonObject {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: CONFIG_SCHEMA_URL,
    type: 'object',
    additionalProperties: false,
    required: ['version', 'settings'],
    properties: {
      $schema: { type: 'string' },
      version: { const: 1 },
      deployment: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          mode: { enum: ['staging', 'production'] },
          project_id: { type: 'string' },
          project_name: { type: 'string' },
        },
      },
      settings: {
        type: 'object',
        additionalProperties: false,
        properties: {
          auth: openApiSchemas.DeploymentAuthSettingsUpdates ?? { type: 'object' },
          display: openApiSchemas.DeploymentDisplaySettingsUpdates ?? { type: 'object' },
          b2b: openApiSchemas.DeploymentB2bSettingsUpdates ?? { type: 'object' },
          restrictions: openApiSchemas.DeploymentRestrictionsUpdates ?? { type: 'object' },
        },
      },
    },
    $defs: openApiSchemas,
  };
}

async function readDesiredConfig(filePath: string): Promise<WachtConfigFile> {
  return normalizeConfig(JSON.parse(await readFile(filePath, 'utf8')));
}

async function deploymentTarget(options: ConfigOptions, desired?: WachtConfigFile): Promise<{ id: string; mode?: string; project_id?: string; project_name?: string }> {
  const context = await readBenchContext();
  const id = options.deployment ?? desired?.deployment?.id ?? context?.deployment_id;
  if (!id) throw new Error('Select an active deployment first, pass --deployment <id>, or include deployment.id in the config file.');
  return {
    id,
    mode: desired?.deployment?.mode ?? context?.deployment_mode,
    project_id: desired?.deployment?.project_id ?? context?.project_id,
    project_name: desired?.deployment?.project_name ?? context?.project_name,
  };
}

async function pullConfigForTarget(ctx: CliContext, target: { id: string; mode?: string; project_id?: string; project_name?: string }): Promise<WachtConfigFile> {
  const data = await machineRequest(`/deployments/${target.id}`);
  return configFromDeployment(data, target);
}

function assertCanApply(target: { id: string; mode?: string }, options: ConfigOptions): void {
  if (target.mode === 'production') {
    if (!options.production) {
      throw new Error('Refusing to apply config to production without --production.');
    }
    if (options.confirm !== target.id) {
      throw new Error(`Refusing to apply config to production without --confirm ${target.id}.`);
    }
  }
  if (!options.yes) {
    throw new Error('Refusing to apply config without --yes. Use --dry-run to preview changes.');
  }
}

function printChanges(ctx: CliContext, changes: ConfigChange[]): void {
  if (!changes.length) {
    log(ctx, 'No config changes.');
    return;
  }
  for (const change of changes) {
    log(ctx, `${change.path}:`);
    log(ctx, `  before: ${JSON.stringify(change.before)}`);
    log(ctx, `  after:  ${JSON.stringify(change.after)}`);
  }
}

async function applySection(deploymentId: string, sectionName: string, payload: JsonObject): Promise<void> {
  const routes: Record<string, { method: string; path: string }> = {
    auth: { method: 'PATCH', path: '/settings/auth' },
    display: { method: 'PATCH', path: '/settings/display' },
    b2b: { method: 'PATCH', path: '/settings/b2b' },
    restrictions: { method: 'PATCH', path: '/settings/restrictions' },
  };
  const route = routes[sectionName];
  if (!route) throw new Error(`Unsupported config section: ${sectionName}`);
  await machineRequest(`/deployments/${deploymentId}${route.path}`, {
    method: route.method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function configPull(ctx: CliContext, options: ConfigOptions): Promise<void> {
  const target = await deploymentTarget(options);
  const config = await pullConfigForTarget(ctx, target);
  if (ctx.json) {
    printJson({ ok: true, config });
    return;
  }
  const filePath = options.file ?? DEFAULT_CONFIG_FILE;
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  printBannerFor(ctx);
  log(ctx, section('Config Pulled'));
  log(ctx, field('Deployment', `${config.deployment?.mode ?? 'unknown'} (${config.deployment?.id ?? target.id})`));
  log(ctx, field('File', filePath));
  log(ctx, warning('Secrets and provider credentials are not written to config.'));
}

export async function configSchemaCommand(ctx: CliContext, options: ConfigOptions): Promise<void> {
  const loaded = await loadOpenApiSpec(ctx, { refresh: options.refresh });
  const schemas = isRecord(loaded.spec.components) && isRecord(loaded.spec.components.schemas)
    ? loaded.spec.components.schemas as JsonObject
    : {};
  printJson(configSchema(schemas));
}

export async function configDiff(ctx: CliContext, options: ConfigOptions): Promise<void> {
  const filePath = options.file ?? DEFAULT_CONFIG_FILE;
  const desired = await readDesiredConfig(filePath);
  const target = await deploymentTarget(options, desired);
  const current = await pullConfigForTarget(ctx, target);
  const changes = diffConfigs(current, desired);
  if (ctx.json) {
    printJson({ ok: true, deployment: target, file: filePath, changes });
    return;
  }
  printBannerFor(ctx);
  log(ctx, section('Config Diff'));
  log(ctx, field('Deployment', `${target.mode ?? 'unknown'} (${target.id})`));
  log(ctx, field('File', filePath));
  log(ctx, '');
  printChanges(ctx, changes);
}

export async function configApply(ctx: CliContext, options: ConfigOptions): Promise<void> {
  const filePath = options.file ?? DEFAULT_CONFIG_FILE;
  const desired = await readDesiredConfig(filePath);
  const target = await deploymentTarget(options, desired);
  const current = await pullConfigForTarget(ctx, target);
  const changes = diffConfigs(current, desired);
  const changedSections = sectionChanges(changes);

  if (options.dryRun) {
    if (ctx.json) {
      printJson({ ok: true, dryRun: true, deployment: target, file: filePath, changedSections, changes });
      return;
    }
    printBannerFor(ctx);
    log(ctx, section('Config Apply Dry Run'));
    log(ctx, field('Deployment', `${target.mode ?? 'unknown'} (${target.id})`));
    log(ctx, field('File', filePath));
    log(ctx, '');
    printChanges(ctx, changes);
    return;
  }

  assertCanApply(target, options);
  for (const sectionName of changedSections) {
    const payload = desired.settings[sectionName as typeof SETTINGS_SECTIONS[number]];
    if (payload) await applySection(target.id, sectionName, payload);
  }

  if (ctx.json) {
    printJson({ ok: true, dryRun: false, deployment: target, file: filePath, changedSections, changes });
    return;
  }
  printBannerFor(ctx);
  log(ctx, section('Config Applied'));
  log(ctx, field('Deployment', `${target.mode ?? 'unknown'} (${target.id})`));
  log(ctx, field('Sections', changedSections.length ? changedSections.join(', ') : 'none'));
  log(ctx, success('Wacht config is up to date.'));
}

export function printConfigTemplate(ctx: CliContext): void {
  const template: WachtConfigFile = {
    $schema: CONFIG_SCHEMA_URL,
    version: 1,
    deployment: {
      id: '',
      mode: 'staging',
    },
    settings: {
      display: {
        app_name: 'My App',
        sign_in_page_url: '/sign-in',
        sign_up_page_url: '/sign-up',
      },
      restrictions: {
        sign_up_mode: 'public',
      },
    },
  };
  if (ctx.json) {
    printJson({ ok: true, template, openApiUrl: PLATFORM_OPENAPI_URL });
    return;
  }
  printJson(template);
}
