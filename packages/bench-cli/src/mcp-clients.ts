import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { MCP_URL } from './config.js';

export const SERVER_NAME = 'wacht-docs';

export type Scope = 'user' | 'project';

export interface ClientTarget {
  id: string;
  label: string;
  scope: Scope;
  client: string;
  configPath: string;
  format: 'json-mcpServers' | 'json-vscode' | 'toml-codex';
  detect(): Promise<boolean>;
}

const HOME = os.homedir();
const PLATFORM = process.platform;

function fileExists(p: string): Promise<boolean> {
  return stat(p).then(() => true).catch(() => false);
}

async function looksLikeProjectRoot(): Promise<boolean> {
  const cwd = process.cwd();
  for (const marker of ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', '.git']) {
    if (await fileExists(path.join(cwd, marker))) return true;
  }
  return false;
}

function claudeDesktopPath(): string {
  if (PLATFORM === 'darwin') {
    return path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (PLATFORM === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(HOME, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(HOME, '.config'), 'Claude', 'claude_desktop_config.json');
}

function vscodeUserDir(): string {
  if (PLATFORM === 'darwin') return path.join(HOME, 'Library', 'Application Support', 'Code', 'User');
  if (PLATFORM === 'win32') return path.join(process.env.APPDATA ?? path.join(HOME, 'AppData', 'Roaming'), 'Code', 'User');
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(HOME, '.config'), 'Code', 'User');
}

export async function listTargets(): Promise<ClientTarget[]> {
  const cwd = process.cwd();
  const inProject = await looksLikeProjectRoot();

  const targets: ClientTarget[] = [
    {
      id: 'claude-desktop',
      label: 'Claude Desktop',
      scope: 'user',
      client: 'claude-desktop',
      configPath: claudeDesktopPath(),
      format: 'json-mcpServers',
      detect: async () => fileExists(path.dirname(claudeDesktopPath())),
    },
    {
      id: 'claude-code-user',
      label: 'Claude Code (user)',
      scope: 'user',
      client: 'claude-code',
      configPath: path.join(HOME, '.claude.json'),
      format: 'json-mcpServers',
      detect: async () =>
        (await fileExists(path.join(HOME, '.claude.json'))) || (await fileExists(path.join(HOME, '.claude'))),
    },
    {
      id: 'cursor-user',
      label: 'Cursor (user)',
      scope: 'user',
      client: 'cursor',
      configPath: path.join(HOME, '.cursor', 'mcp.json'),
      format: 'json-mcpServers',
      detect: async () => fileExists(path.join(HOME, '.cursor')),
    },
    {
      id: 'vscode-user',
      label: 'VS Code (user)',
      scope: 'user',
      client: 'vscode',
      configPath: path.join(vscodeUserDir(), 'mcp.json'),
      format: 'json-vscode',
      detect: async () => fileExists(vscodeUserDir()),
    },
    {
      id: 'windsurf',
      label: 'Windsurf',
      scope: 'user',
      client: 'windsurf',
      configPath: path.join(HOME, '.codeium', 'windsurf', 'mcp_config.json'),
      format: 'json-mcpServers',
      detect: async () => fileExists(path.join(HOME, '.codeium', 'windsurf')),
    },
    {
      id: 'codex',
      label: 'Codex CLI (OpenAI)',
      scope: 'user',
      client: 'codex',
      configPath: path.join(HOME, '.codex', 'config.toml'),
      format: 'toml-codex',
      detect: async () => fileExists(path.join(HOME, '.codex')),
    },
  ];

  if (inProject) {
    targets.push(
      {
        id: 'claude-code-project',
        label: 'Claude Code (project)',
        scope: 'project',
        client: 'claude-code',
        configPath: path.join(cwd, '.mcp.json'),
        format: 'json-mcpServers',
        detect: async () => fileExists(path.join(cwd, '.mcp.json')),
      },
      {
        id: 'cursor-project',
        label: 'Cursor (project)',
        scope: 'project',
        client: 'cursor',
        configPath: path.join(cwd, '.cursor', 'mcp.json'),
        format: 'json-mcpServers',
        detect: async () => fileExists(path.join(cwd, '.cursor')),
      },
      {
        id: 'vscode-project',
        label: 'VS Code (project)',
        scope: 'project',
        client: 'vscode',
        configPath: path.join(cwd, '.vscode', 'mcp.json'),
        format: 'json-vscode',
        detect: async () => fileExists(path.join(cwd, '.vscode')),
      },
    );
  }

  return targets;
}

export async function findTarget(id: string): Promise<ClientTarget | undefined> {
  const targets = await listTargets();
  return targets.find((t) => t.id === id);
}

// ─── JSON helpers ─────────────────────────────────────────────────────

function stripJsonComments(text: string): string {
  // Remove /* ... */ and // line comments, plus trailing commas before } or ].
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(filePath, 'utf8').catch(() => '');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function stdioServer(): { command: string; args: string[] } {
  return { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL] };
}

// ─── Per-format readers/writers ───────────────────────────────────────

async function applyMcpServersJson(target: ClientTarget, action: 'install' | 'remove'): Promise<void> {
  const config = await readJson(target.configPath);
  const servers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};

  if (action === 'install') {
    // Claude Desktop is stdio-only; Claude Code/Cursor/Windsurf accept HTTP url.
    servers[SERVER_NAME] = target.client === 'claude-desktop'
      ? stdioServer()
      : { url: MCP_URL };
  } else {
    delete servers[SERVER_NAME];
  }

  config.mcpServers = servers;
  await writeJson(target.configPath, config);
}

async function applyVscodeJson(target: ClientTarget, action: 'install' | 'remove'): Promise<void> {
  const config = await readJson(target.configPath);
  const servers = (config.servers as Record<string, unknown> | undefined) ?? {};

  if (action === 'install') {
    servers[SERVER_NAME] = { type: 'http', url: MCP_URL };
  } else {
    delete servers[SERVER_NAME];
  }

  config.servers = servers;
  await writeJson(target.configPath, config);
}

async function applyCodexToml(target: ClientTarget, action: 'install' | 'remove'): Promise<void> {
  const existing = await readFile(target.configPath, 'utf8').catch(() => '');
  const sectionHeader = `[mcp_servers.${SERVER_NAME}]`;
  const blockRegex = new RegExp(
    `(^|\\n)\\[mcp_servers\\.${SERVER_NAME}\\][\\s\\S]*?(?=\\n\\[|$)`,
    'm',
  );

  let next = existing.replace(blockRegex, '').replace(/\n{3,}/g, '\n\n').trimEnd();

  if (action === 'install') {
    const block = [
      sectionHeader,
      `command = "npx"`,
      `args = ["-y", "mcp-remote", "${MCP_URL}"]`,
    ].join('\n');
    next = next ? `${next}\n\n${block}\n` : `${block}\n`;
  } else if (next) {
    next = `${next}\n`;
  }

  await mkdir(path.dirname(target.configPath), { recursive: true });
  await writeFile(target.configPath, next, 'utf8');
}

export async function applyTarget(target: ClientTarget, action: 'install' | 'remove'): Promise<void> {
  switch (target.format) {
    case 'json-mcpServers':
      return applyMcpServersJson(target, action);
    case 'json-vscode':
      return applyVscodeJson(target, action);
    case 'toml-codex':
      return applyCodexToml(target, action);
  }
}

export async function isInstalled(target: ClientTarget): Promise<boolean> {
  const exists = await fileExists(target.configPath);
  if (!exists) return false;
  if (target.format === 'toml-codex') {
    const raw = await readFile(target.configPath, 'utf8').catch(() => '');
    return raw.includes(`[mcp_servers.${SERVER_NAME}]`);
  }
  const config = await readJson(target.configPath);
  if (target.format === 'json-vscode') {
    const servers = config.servers as Record<string, unknown> | undefined;
    return !!servers?.[SERVER_NAME];
  }
  const servers = config.mcpServers as Record<string, unknown> | undefined;
  return !!servers?.[SERVER_NAME];
}
