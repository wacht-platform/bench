import path from 'node:path';

import { MCP_URL } from './config.js';
import { applyTarget, isInstalled, listTargets, SERVER_NAME, type ClientTarget } from './mcp-clients.js';
import { promptConfirm, promptMultiSelect } from './prompts.js';
import type { CliContext } from './types.js';
import { field, log, printJson, section, success, warning } from './ui.js';

export function printMcpConfig(client: string): void {
  if (client === 'claude' || client === 'claude-desktop') {
    console.log(JSON.stringify({
      mcpServers: {
        [SERVER_NAME]: {
          command: 'npx',
          args: ['-y', 'mcp-remote', MCP_URL],
        },
      },
    }, null, 2));
    return;
  }

  if (client === 'vscode') {
    console.log(JSON.stringify({
      servers: { [SERVER_NAME]: { type: 'http', url: MCP_URL } },
    }, null, 2));
    return;
  }

  if (client === 'codex') {
    console.log(`[mcp_servers.${SERVER_NAME}]\ncommand = "npx"\nargs = ["-y", "mcp-remote", "${MCP_URL}"]`);
    return;
  }

  console.log(JSON.stringify({
    mcpServers: { [SERVER_NAME]: { url: MCP_URL } },
  }, null, 2));
}

export interface McpInstallOptions {
  clients?: string[];
  yes?: boolean;
  all?: boolean;
}

function homeRelative(filePath: string): string {
  const home = process.env.HOME ?? '';
  if (home && filePath.startsWith(home)) return `~${filePath.slice(home.length)}`;
  return filePath;
}

async function selectTargets(
  ctx: CliContext,
  options: McpInstallOptions,
  action: 'install' | 'remove',
): Promise<ClientTarget[]> {
  const all = await listTargets();

  if (options.clients && options.clients.length) {
    const ids = new Set(options.clients);
    const matched = all.filter((t) => ids.has(t.id));
    const missing = [...ids].filter((id) => !matched.find((t) => t.id === id));
    if (missing.length) {
      throw new Error(`Unknown client targets: ${missing.join(', ')}. Run \`wacht mcp list\` to see valid ids.`);
    }
    return matched;
  }

  if (options.all) return all;

  // Detect + multi-select.
  const detection = await Promise.all(all.map(async (t) => ({ target: t, detected: await t.detect() })));
  const items = detection.map(({ target, detected }) => ({
    value: target.id,
    label: target.label,
    hint: detected ? `detected · ${homeRelative(target.configPath)}` : `not detected · ${homeRelative(target.configPath)}`,
    preselected: detected,
  }));

  log(ctx, section(action === 'install' ? 'Install Wacht Docs MCP' : 'Remove Wacht Docs MCP'));
  log(ctx, field('Server URL', MCP_URL));
  log(ctx, '');

  const ids = await promptMultiSelect(ctx, items, action === 'install' ? 'Install to which clients?' : 'Remove from which clients?');
  return all.filter((t) => ids.includes(t.id));
}

export async function installMcp(ctx: CliContext, options: McpInstallOptions): Promise<void> {
  const targets = await selectTargets(ctx, options, 'install');

  if (!targets.length) {
    log(ctx, warning('No MCP clients selected. Nothing to do.'));
    if (ctx.json) printJson({ ok: true, written: [] });
    return;
  }

  if (!options.yes && !options.clients && ctx.interactive) {
    log(ctx, '');
    log(ctx, 'Will write to:');
    for (const target of targets) {
      log(ctx, `  - ${target.label}  ${homeRelative(target.configPath)}`);
    }
    const ok = await promptConfirm(ctx, 'Proceed?', true);
    if (!ok) {
      log(ctx, warning('Aborted.'));
      return;
    }
  }

  const written: { id: string; path: string }[] = [];
  for (const target of targets) {
    await applyTarget(target, 'install');
    written.push({ id: target.id, path: target.configPath });
    log(ctx, field('Wrote', `${target.label} · ${homeRelative(target.configPath)}`));
  }

  if (ctx.json) {
    printJson({ ok: true, server: SERVER_NAME, url: MCP_URL, written });
    return;
  }

  log(ctx, '');
  log(ctx, success(`Installed Wacht Docs MCP into ${written.length} client${written.length === 1 ? '' : 's'}.`));
  log(ctx, 'Restart the affected clients for the change to take effect.');
}

export async function uninstallMcp(ctx: CliContext, options: McpInstallOptions): Promise<void> {
  const targets = await selectTargets(ctx, options, 'remove');

  if (!targets.length) {
    log(ctx, warning('No MCP clients selected. Nothing to do.'));
    if (ctx.json) printJson({ ok: true, removed: [] });
    return;
  }

  const removed: { id: string; path: string }[] = [];
  for (const target of targets) {
    await applyTarget(target, 'remove');
    removed.push({ id: target.id, path: target.configPath });
    log(ctx, field('Updated', `${target.label} · ${homeRelative(target.configPath)}`));
  }

  if (ctx.json) {
    printJson({ ok: true, server: SERVER_NAME, removed });
    return;
  }

  log(ctx, '');
  log(ctx, success(`Removed Wacht Docs MCP from ${removed.length} client${removed.length === 1 ? '' : 's'}.`));
}

export async function listMcp(ctx: CliContext): Promise<void> {
  const all = await listTargets();
  const rows = await Promise.all(
    all.map(async (target) => ({
      id: target.id,
      label: target.label,
      scope: target.scope,
      configPath: target.configPath,
      detected: await target.detect(),
      installed: await isInstalled(target),
    })),
  );

  if (ctx.json) {
    printJson({ server: SERVER_NAME, url: MCP_URL, targets: rows });
    return;
  }

  log(ctx, section('MCP client targets'));
  log(ctx, field('Server URL', MCP_URL));
  log(ctx, '');
  for (const row of rows) {
    const detect = row.detected ? 'detected' : 'not detected';
    const status = row.installed ? 'installed' : 'not installed';
    log(ctx, `  ${row.id.padEnd(22)} ${row.label}`);
    log(ctx, `  ${''.padEnd(22)} ${detect} · ${status} · ${homeRelative(row.configPath)}`);
  }
  log(ctx, '');
  log(ctx, `Use ${'`wacht mcp install`'} to bulk-apply, ${'`wacht mcp install --client <id,...>`'} to target specific entries.`);
}
