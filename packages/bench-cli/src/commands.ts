import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

const PKG_VERSION = (() => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

import { completionScript, type CompletionShell } from './completion.js';
import {
  configApply,
  configDiff,
  configPull,
  configSchemaCommand,
  printConfigTemplate,
} from './config-workflow.js';
import {
  clearDeployment,
  createDeploymentCommand,
  createProjectCommand,
  currentDeployment,
  selectDeployment,
} from './deployment-context.js';
import { initProject, initStarter } from './init.js';
import { docsGet, docsSearch } from './docs-search.js';
import { envPull } from './env-pull.js';
import { apiCommand, listProjects } from './machine-api.js';
import { openApiCall, openApiDescribe, openApiList, openApiRefresh } from './openapi.js';
import { installMcp, listMcp, printMcpConfig, uninstallMcp } from './mcp.js';
import { authStatus, login, logout } from './oauth.js';
import {
  createOrg,
  createUser,
  createWorkspace,
  getOrg,
  getUser,
  getWorkspace,
  listOrgs,
  listUsers,
  listWorkspaces,
} from './resources.js';
import { installSkills } from './skills.js';
import type { CliContext } from './types.js';
import { banner } from './ui.js';

type GlobalOptions = {
  json?: boolean;
  quiet?: boolean;
  banner?: boolean;
  color?: boolean;
  interactive?: boolean;
};

type ApiOptions = {
  body?: string;
  field?: string[];
  form?: string[];
  file?: string[];
  header?: string[];
  param?: string[];
  deployment?: string;
  refresh?: boolean;
  tag?: string;
  search?: string;
};

type ProjectCreateOptions = {
  name?: string;
  method?: string[];
  select?: boolean;
};

type DeploymentSelectOptions = {
  project?: string;
  deployment?: string;
  mode?: string;
};

type DeploymentCreateOptions = {
  project?: string;
  mode?: string;
  domain?: string;
  method?: string[];
  select?: boolean;
};

type ConfigCommandOptions = {
  file?: string;
  deployment?: string;
  dryRun?: boolean;
  yes?: boolean;
  production?: boolean;
  confirm?: string;
  refresh?: boolean;
};

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

type ResourceListOptions = {
  deployment?: string;
  limit?: string;
  offset?: string;
  search?: string;
};

type ResourceCreateOptions = {
  deployment?: string;
  body?: string;
  field?: string[];
  form?: string[];
  file?: string[];
  header?: string[];
};

type ResourceGetOptions = {
  deployment?: string;
};

type WorkspaceListOptions = ResourceListOptions & { org?: string };
type WorkspaceCreateOptions = ResourceCreateOptions & { org?: string };

type StarterOptions = {
  starter?: string | boolean;
  target?: string;
  installSkills?: boolean;
  client?: string;
};

function context(command: Command): CliContext {
  const options = command.optsWithGlobals<GlobalOptions>();
  if (options.color === false) {
    process.env.NO_COLOR = '1';
  }
  return {
    json: !!options.json,
    quiet: !!options.quiet,
    banner: options.banner !== false,
    interactive: options.interactive !== false && !options.json && !options.quiet,
  };
}

function initArgs(options: {
  client?: string;
  installSkills?: boolean;
  skipAgents?: boolean;
  skipEnv?: boolean;
}): string[] {
  const args: string[] = [];
  if (options.client) args.push('--client', options.client);
  if (options.installSkills) args.push('--install-skills');
  if (options.skipAgents) args.push('--skip-agents');
  if (options.skipEnv) args.push('--skip-env');
  return args;
}

export async function runCli(args: string[]): Promise<void> {
  const program = new Command();

  program
    .name('wacht')
    .description('AI development workbench for Wacht')
    .version(PKG_VERSION, '-v, --version', 'print Wacht Bench CLI version')
    .showHelpAfterError()
    .option('--json', 'emit machine-readable JSON where supported')
    .option('--quiet', 'suppress nonessential human output')
    .option('--no-interactive', 'do not prompt; require explicit arguments and flags')
    .option('--no-banner', 'hide the Wacht Bench banner')
    .option('--no-color', 'disable colored output')
    .addHelpText('beforeAll', () => {
      const options = program.opts<GlobalOptions>();
      if (options.json || options.quiet || options.banner === false) return '';
      return `${banner()}\n\n`;
    });

  program
    .command('init')
    .description('bootstrap the current project for Wacht development')
    .option('--client <client>', 'assistant client metadata', 'cursor')
    .option('--starter [framework]', 'clone a Wacht starter (nextjs, react-router, tanstack) instead of bootstrapping the current dir')
    .option('--target <dir>', 'target directory when using --starter (defaults to ./wacht-<framework>-starter)')
    .option('--install-skills', 'run npx skills add after writing config')
    .option('--skip-agents', 'do not create or update AGENTS.md')
    .option('--skip-env', 'do not write .env.wacht.example')
    .action(async (options: StarterOptions & {
      installSkills?: boolean;
      skipAgents?: boolean;
      skipEnv?: boolean;
    }) => {
      const ctx = context(program);
      if (options.starter) {
        const framework = typeof options.starter === 'string' ? options.starter : undefined;
        await initStarter(
          {
            framework,
            target: options.target,
            install: !!options.installSkills,
            client: options.client ?? 'cursor',
          },
          ctx,
        );
        return;
      }
      await initProject(initArgs(options), ctx);
    });

  program
    .command('login')
    .description('log in with Wacht OAuth using Authorization Code + PKCE')
    .option('--skip-select', 'do not select an active deployment after login')
    .action(async (options: { skipSelect?: boolean }) => {
      const ctx = context(program);
      await login(ctx);
      if (!options.skipSelect && ctx.interactive) {
        await selectDeployment(ctx, { optional: true });
      }
    });

  program
    .command('logout')
    .description('clear local Bench auth and revoke the refresh token when possible')
    .action(async () => {
      await logout(context(program));
    });

  const auth = program.command('auth').description('inspect or manage Bench auth');
  auth
    .command('status')
    .description('show local Bench auth status')
    .action(async () => {
      await authStatus(context(program));
    });

  const projects = program.command('projects').description('work with Wacht projects');
  projects
    .command('list')
    .description('list projects visible to the current OAuth grant')
    .action(async () => {
      await listProjects(context(program));
    });
  projects
    .command('create')
    .description('create a Wacht project with its first staging deployment')
    .option('--name <name>', 'project name')
    .option('--method <method>', 'auth method; repeatable. Project/staging: email, phone, username, google_oauth, apple_oauth, facebook_oauth, github_oauth, discord_oauth, linkedin_oauth, gitlab_oauth, x_oauth', collect, [])
    .option('--no-select', 'do not make the created staging deployment active')
    .action(async (options: ProjectCreateOptions) => {
      await createProjectCommand(context(program), options);
    });

  const deployments = program.command('deployments').description('work with Wacht deployments');
  deployments
    .command('current')
    .description('show the active deployment Bench will use')
    .action(async () => {
      await currentDeployment(context(program));
    });
  deployments
    .command('select')
    .description('select the active project/deployment for Bench')
    .option('--project <id>', 'project id')
    .option('--deployment <id>', 'deployment id')
    .option('--mode <mode>', 'deployment mode: staging or production')
    .action(async (options: DeploymentSelectOptions) => {
      await selectDeployment(context(program), options);
    });
  deployments
    .command('clear')
    .description('clear the active deployment selection')
    .action(async () => {
      await clearDeployment(context(program));
    });
  deployments
    .command('create')
    .description('create a staging or production deployment')
    .argument('[mode]', 'staging or production')
    .option('--project <id>', 'project id; defaults to the active project')
    .option('--domain <domain>', 'custom domain for production deployments')
    .option('--method <method>', 'auth method; repeatable. Staging supports social providers; production supports email, phone, username', collect, [])
    .option('--no-select', 'do not make the created deployment active')
    .action(async (mode: string | undefined, options: DeploymentCreateOptions) => {
      await createDeploymentCommand(context(program), { ...options, mode });
    });

  const skills = program.command('skills').description('install Wacht agent skills');
  skills
    .command('install')
    .description('install the Wacht skills pack into one or more AI agents')
    .option('--skill <name>', 'install one skill from the pack')
    .option(
      '--agent <ids>',
      'comma-separated agent ids (e.g. claude-code,cursor,codex); skips the agent picker',
      (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean),
    )
    .option('--all-agents', "install into every supported agent (passes -a '*')")
    .option('--global', 'install at user scope instead of project scope')
    .option('--yes', 'do not prompt for confirmation')
    .option('--copy', 'copy skill files instead of symlinking')
    .action(async (options: {
      skill?: string;
      agent?: string[];
      allAgents?: boolean;
      global?: boolean;
      yes?: boolean;
      copy?: boolean;
    }) => {
      await installSkills({
        skill: options.skill,
        agents: options.agent,
        allAgents: options.allAgents,
        global: options.global,
        yes: options.yes,
        copy: options.copy,
      });
    });

  const mcp = program.command('mcp').description('configure Wacht Docs MCP across AI clients');
  mcp
    .command('list')
    .alias('ls')
    .description('list known MCP clients with detection + install status')
    .action(async () => {
      await listMcp(context(program));
    });
  mcp
    .command('install')
    .description('install Wacht Docs MCP into one or more clients (interactive by default)')
    .option('--client <ids>', 'comma-separated target ids; skips the picker', (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean))
    .option('--all', 'install into every known target without prompting')
    .option('--yes', 'do not ask to confirm before writing')
    .action(async (options: { client?: string[]; all?: boolean; yes?: boolean }) => {
      await installMcp(context(program), { clients: options.client, all: options.all, yes: options.yes });
    });
  mcp
    .command('uninstall')
    .description('remove Wacht Docs MCP from one or more clients')
    .option('--client <ids>', 'comma-separated target ids; skips the picker', (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean))
    .option('--all', 'remove from every known target without prompting')
    .option('--yes', 'do not ask to confirm before writing')
    .action(async (options: { client?: string[]; all?: boolean; yes?: boolean }) => {
      await uninstallMcp(context(program), { clients: options.client, all: options.all, yes: options.yes });
    });
  mcp
    .command('config')
    .description('print raw MCP config JSON for a client (no file write)')
    .option('--client <client>', 'claude-desktop, cursor, vscode, codex, windsurf, claude-code', 'cursor')
    .action((options: { client: string }) => {
      printMcpConfig(options.client);
    });

  const docs = program
    .command('docs')
    .description('search and read Wacht docs from the terminal — no MCP required');
  docs
    .command('search <query...>')
    .description('full-text search Wacht docs and print matching pages')
    .option('--limit <n>', 'max number of pages to print', (v: string) => Number.parseInt(v, 10))
    .option('--base-url <url>', 'docs base URL (default: https://wacht.dev/docs, or $WACHT_DOCS_URL)')
    .option('--json', 'emit JSON instead of human-readable output')
    .action(async (queryParts: string[], options: { limit?: number; baseUrl?: string; json?: boolean }) => {
      await docsSearch(context(program), {
        query: queryParts.join(' '),
        limit: options.limit,
        baseUrl: options.baseUrl,
        json: options.json,
      });
    });
  docs
    .command('get <path>')
    .description('print the full Markdown of a Wacht docs page (e.g. /sdks/nextjs/middleware)')
    .option('--base-url <url>', 'docs base URL (default: https://wacht.dev/docs, or $WACHT_DOCS_URL)')
    .option('--json', 'emit JSON ({ path, url, markdown }) instead of raw Markdown')
    .action(async (docPath: string, options: { baseUrl?: string; json?: boolean }) => {
      await docsGet(context(program), {
        path: docPath,
        baseUrl: options.baseUrl,
        json: options.json,
      });
    });

  const env = program.command('env').description('manage deployment credentials and environment files');
  env
    .command('pull')
    .description('mint a fresh backend API key for the active deployment and write keys to .env.local')
    .option('--file <path>', 'env file path; defaults to .env.local in the current directory')
    .option('--print', 'print credentials to stdout instead of writing the env file')
    .action(async (options: { file?: string; print?: boolean }) => {
      await envPull(context(program), options);
    });

  const config = program.command('config').description('manage Wacht deployment settings as code');
  config
    .command('pull')
    .description('pull the active deployment settings into wacht.config.json')
    .option('--file <path>', 'config file path', 'wacht.config.json')
    .option('--deployment <id>', 'deployment id override; defaults to active deployment')
    .action(async (options: ConfigCommandOptions) => {
      await configPull(context(program), options);
    });
  config
    .command('schema')
    .description('print the Wacht config JSON schema')
    .option('--refresh', 'refresh the cached OpenAPI schema first')
    .action(async (options: ConfigCommandOptions) => {
      await configSchemaCommand(context(program), options);
    });
  config
    .command('template')
    .description('print a minimal Wacht config template')
    .action(() => {
      printConfigTemplate(context(program));
    });
  config
    .command('diff')
    .description('compare a config file with the active deployment')
    .option('--file <path>', 'config file path', 'wacht.config.json')
    .option('--deployment <id>', 'deployment id override; defaults to config or active deployment')
    .action(async (options: ConfigCommandOptions) => {
      await configDiff(context(program), options);
    });
  config
    .command('apply')
    .description('apply a config file to the active deployment')
    .option('--file <path>', 'config file path', 'wacht.config.json')
    .option('--deployment <id>', 'deployment id override; defaults to config or active deployment')
    .option('--dry-run', 'preview changes without applying them')
    .option('--yes', 'required to apply changes')
    .option('--production', 'allow applying to a production deployment')
    .option('--confirm <deployment_id>', 'required with --production; must match the deployment id')
    .action(async (options: ConfigCommandOptions) => {
      await configApply(context(program), options);
    });

  const api = program
    .command('api')
    .description('call the Wacht Machine API')
    .argument('[method]', 'HTTP method')
    .argument('[path]', 'API path, for example /projects')
    .option('--body <json>', 'JSON request body')
    .option('--field <key=value>', 'URL-encoded form field; repeatable', collect, [])
    .option('--form <key=value>', 'multipart form field; value @path is treated as a file; repeatable', collect, [])
    .option('--file <key=path>', 'multipart file field; key=path or key=@path; repeatable', collect, [])
    .option('--header <key=value>', 'request header; repeatable', collect, [])
    .action(async (method: string | undefined, path: string | undefined, options: ApiOptions) => {
      await apiCommand(method, path, options, context(program));
    });

  api
    .command('ls')
    .description('list operations from the Wacht Platform OpenAPI schema')
    .option('--tag <tag>', 'filter by OpenAPI tag')
    .option('--search <text>', 'filter by operation id, summary, path, or tag')
    .option('--refresh', 'refresh the cached OpenAPI schema first')
    .action(async (options: ApiOptions) => {
      await openApiList(context(program), options);
    });

  api
    .command('describe')
    .description('describe an OpenAPI operation by operation id or METHOD path')
    .argument('<operationOrMethod>', 'operation id, or HTTP method when path is also passed')
    .argument('[path]', 'OpenAPI path, for example /users')
    .option('--refresh', 'refresh the cached OpenAPI schema first')
    .action(async (operationOrMethod: string, path: string | undefined, options: ApiOptions) => {
      await openApiDescribe(context(program), operationOrMethod, path, options);
    });

  api
    .command('call')
    .description('call an OpenAPI operation by operation id using the active deployment')
    .argument('<operation>', 'OpenAPI operation id')
    .option('--deployment <id>', 'deployment id override; defaults to active deployment')
    .option('--param <key=value>', 'path or query parameter; repeatable', collect, [])
    .option('--body <json>', 'JSON request body; pass @path/to/file.json to read from disk')
    .option('--field <key=value>', 'URL-encoded form field; repeatable', collect, [])
    .option('--form <key=value>', 'multipart form field; value @path is treated as a file; repeatable', collect, [])
    .option('--file <key=path>', 'multipart file field; key=path or key=@path; repeatable', collect, [])
    .option('--header <key=value>', 'request header; repeatable', collect, [])
    .option('--refresh', 'refresh the cached OpenAPI schema first')
    .option('--no-validate', 'skip local JSON Schema validation of the request body')
    .action(async (operation: string, _options: ApiOptions, cmd: Command) => {
      // The parent `api` command also declares --body / --field / --form / --file / --header
      // so `optsWithGlobals()` is what actually surfaces them through this subcommand.
      // Commander does not merge clashing options automatically.
      await openApiCall(context(program), operation, cmd.optsWithGlobals() as ApiOptions);
    });

  const schema = api.command('schema').description('manage cached OpenAPI schema');
  schema
    .command('refresh')
    .description('download and cache the latest Wacht Platform OpenAPI schema')
    .action(async () => {
      await openApiRefresh(context(program));
    });

  // ─── Resources ────────────────────────────────────────────────
  const users = program.command('users').description('list, get, or create users in the active deployment');
  users
    .command('list')
    .description('list users in the active deployment')
    .option('--deployment <id>', 'deployment id override')
    .option('--limit <n>', 'page size')
    .option('--offset <n>', 'page offset')
    .option('--search <q>', 'search query')
    .action(async (options: ResourceListOptions) => {
      await listUsers(context(program), options);
    });
  users
    .command('get')
    .description('get a user by id')
    .argument('<userId>', 'user id')
    .option('--deployment <id>', 'deployment id override')
    .action(async (userId: string, options: ResourceGetOptions) => {
      await getUser(context(program), userId, options);
    });
  users
    .command('create')
    .description('create a user via the Machine API')
    .option('--deployment <id>', 'deployment id override')
    .option('--body <json>', 'JSON request body')
    .option('--field <key=value>', 'URL-encoded form field; repeatable', collect, [])
    .option('--form <key=value>', 'multipart form field; repeatable', collect, [])
    .option('--file <key=path>', 'multipart file field; repeatable', collect, [])
    .option('--header <key=value>', 'request header; repeatable', collect, [])
    .action(async (options: ResourceCreateOptions) => {
      await createUser(context(program), options);
    });

  const orgs = program.command('orgs').alias('organizations').description('list, get, or create organizations');
  orgs
    .command('list')
    .description('list organizations in the active deployment')
    .option('--deployment <id>', 'deployment id override')
    .option('--limit <n>', 'page size')
    .option('--offset <n>', 'page offset')
    .option('--search <q>', 'search query')
    .action(async (options: ResourceListOptions) => {
      await listOrgs(context(program), options);
    });
  orgs
    .command('get')
    .description('get an organization by id')
    .argument('<orgId>', 'organization id')
    .option('--deployment <id>', 'deployment id override')
    .action(async (orgId: string, options: ResourceGetOptions) => {
      await getOrg(context(program), orgId, options);
    });
  orgs
    .command('create')
    .description('create an organization')
    .option('--deployment <id>', 'deployment id override')
    .option('--body <json>', 'JSON request body')
    .option('--field <key=value>', 'URL-encoded form field; repeatable', collect, [])
    .option('--form <key=value>', 'multipart form field; repeatable', collect, [])
    .option('--file <key=path>', 'multipart file field; repeatable', collect, [])
    .option('--header <key=value>', 'request header; repeatable', collect, [])
    .action(async (options: ResourceCreateOptions) => {
      await createOrg(context(program), options);
    });

  const workspaces = program.command('workspaces').description('list, get, or create workspaces');
  workspaces
    .command('list')
    .description('list workspaces in the active deployment, optionally filtered by org')
    .option('--deployment <id>', 'deployment id override')
    .option('--org <id>', 'list workspaces under a specific organization')
    .option('--limit <n>', 'page size')
    .option('--offset <n>', 'page offset')
    .option('--search <q>', 'search query')
    .action(async (options: WorkspaceListOptions) => {
      await listWorkspaces(context(program), options);
    });
  workspaces
    .command('get')
    .description('get a workspace by id')
    .argument('<workspaceId>', 'workspace id')
    .option('--deployment <id>', 'deployment id override')
    .action(async (workspaceId: string, options: ResourceGetOptions) => {
      await getWorkspace(context(program), workspaceId, options);
    });
  workspaces
    .command('create')
    .description('create a workspace under an organization')
    .option('--deployment <id>', 'deployment id override')
    .requiredOption('--org <id>', 'organization id (workspaces are scoped to an org)')
    .option('--body <json>', 'JSON request body')
    .option('--field <key=value>', 'URL-encoded form field; repeatable', collect, [])
    .option('--form <key=value>', 'multipart form field; repeatable', collect, [])
    .option('--file <key=path>', 'multipart file field; repeatable', collect, [])
    .option('--header <key=value>', 'request header; repeatable', collect, [])
    .action(async (options: WorkspaceCreateOptions) => {
      await createWorkspace(context(program), options);
    });

  // ─── Shell completion ─────────────────────────────────────────
  program
    .command('completion')
    .description('print shell completion script (bash, zsh, fish, powershell)')
    .argument('[shell]', 'bash, zsh, fish, or powershell')
    .action((shellArg: string | undefined) => {
      const shell = (shellArg ?? '').toLowerCase() as CompletionShell;
      if (!['bash', 'zsh', 'fish', 'powershell'].includes(shell)) {
        console.error(
          'Pass a shell: wacht completion bash | zsh | fish | powershell\n' +
            '  bash:        wacht completion bash > /etc/bash_completion.d/wacht\n' +
            '  zsh:         wacht completion zsh  > "${fpath[1]}/_wacht"\n' +
            '  fish:        wacht completion fish > ~/.config/fish/completions/wacht.fish\n' +
            '  powershell:  wacht completion powershell | Out-String | Invoke-Expression',
        );
        process.exitCode = 1;
        return;
      }
      process.stdout.write(completionScript(shell));
    });

  await program.parseAsync(args, { from: 'user' });
}
