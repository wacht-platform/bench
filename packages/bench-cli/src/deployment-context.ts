import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { clearBenchContext, readBenchContext, writeBenchContext } from './context-store.js';
import {
  createDeployment,
  createProject,
  getProjects,
  type DeploymentSummary,
  type ProjectSummary,
} from './machine-api.js';
import { canPrompt, promptChoice, promptList, promptOptionalText, promptText } from './prompts.js';
import type { CliContext, StoredBenchContext } from './types.js';
import { command, field, log, printBannerFor, printJson, section, success } from './ui.js';

interface DeploymentChoice {
  project: ProjectSummary;
  deployment: DeploymentSummary;
}

interface SelectOptions {
  project?: string;
  deployment?: string;
  mode?: string;
  optional?: boolean;
}

interface CreateProjectOptions {
  name?: string;
  method?: string[];
  select?: boolean;
}

interface CreateDeploymentOptions {
  project?: string;
  mode?: string;
  domain?: string;
  method?: string[];
  select?: boolean;
}

const IDENTITY_AUTH_METHODS = ['email', 'phone', 'username'];
const SOCIAL_AUTH_METHODS = [
  'google_oauth',
  'apple_oauth',
  'facebook_oauth',
  'github_oauth',
  'discord_oauth',
  'linkedin_oauth',
  'gitlab_oauth',
  'x_oauth',
];
const DEPLOYMENT_AUTH_METHODS = [...IDENTITY_AUTH_METHODS, ...SOCIAL_AUTH_METHODS];
const PRODUCTION_AUTH_METHODS = IDENTITY_AUTH_METHODS;

function choicesFrom(projects: ProjectSummary[]): DeploymentChoice[] {
  return projects.flatMap((project) => project.deployment_items.map((deployment) => ({ project, deployment })));
}

function contextFrom(choice: DeploymentChoice): StoredBenchContext {
  return {
    project_id: choice.project.id,
    project_name: choice.project.name,
    deployment_id: choice.deployment.id,
    deployment_mode: choice.deployment.mode,
    deployment_backend_host: choice.deployment.backend_host,
    deployment_frontend_host: choice.deployment.frontend_host,
    updated_at: Date.now(),
  };
}

function findChoice(projects: ProjectSummary[], options: SelectOptions): DeploymentChoice | null {
  const choices = choicesFrom(projects);
  if (options.deployment) {
    return choices.find((choice) => choice.deployment.id === options.deployment) ?? null;
  }
  if (options.project && options.mode) {
    return choices.find((choice) => choice.project.id === options.project && choice.deployment.mode === options.mode) ?? null;
  }
  if (options.project) {
    const projectChoices = choices.filter((choice) => choice.project.id === options.project);
    return projectChoices.length === 1 ? projectChoices[0] : null;
  }
  return choices.length === 1 ? choices[0] : null;
}

async function promptForChoice(choices: DeploymentChoice[]): Promise<DeploymentChoice> {
  const rl = createInterface({ input, output });
  try {
    for (const [index, choice] of choices.entries()) {
      const label = `${choice.project.name} / ${choice.deployment.mode}`;
      console.log(`${index + 1}. ${label} (${choice.deployment.id})`);
    }
    console.log('');
    const answer = await rl.question('Select active deployment: ');
    const index = Number.parseInt(answer, 10) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= choices.length) {
      throw new Error('Invalid deployment selection.');
    }
    return choices[index];
  } finally {
    rl.close();
  }
}

function defaultMethods(methods: string[] | undefined): string[] {
  return methods && methods.length ? methods : ['email'];
}

function methodPrompt(allowedMethods: string[]): string {
  return `Auth methods, comma separated [email]. Allowed: ${allowedMethods.join(', ')}: `;
}

function validateMethods(methods: string[], allowedMethods: string[]): string[] {
  const normalized = methods.map((method) => method.trim()).filter(Boolean);
  const invalid = normalized.filter((method) => !allowedMethods.includes(method));
  if (invalid.length) {
    throw new Error(`Invalid auth method(s): ${invalid.join(', ')}. Allowed: ${allowedMethods.join(', ')}.`);
  }
  if (!normalized.length) {
    throw new Error(`At least one auth method is required. Allowed: ${allowedMethods.join(', ')}.`);
  }
  return Array.from(new Set(normalized));
}

function printActiveContext(ctx: CliContext, context: StoredBenchContext): void {
  log(ctx, field('Project', `${context.project_name} (${context.project_id})`));
  log(ctx, field('Deployment', `${context.deployment_mode} (${context.deployment_id})`));
  if (context.deployment_backend_host) {
    log(ctx, field('Backend', context.deployment_backend_host));
  }
  if (context.deployment_frontend_host) {
    log(ctx, field('Frontend', context.deployment_frontend_host));
  }
}

export async function currentDeployment(ctx: CliContext): Promise<void> {
  const context = await readBenchContext();
  if (ctx.json) {
    printJson({ ok: true, active: context });
    return;
  }
  printBannerFor(ctx);
  log(ctx, section('Active Deployment'));
  if (!context) {
    log(ctx, 'No active deployment selected.');
    log(ctx, `Run ${command('wacht deployments select')} to choose one.`);
    return;
  }
  printActiveContext(ctx, context);
}

export async function selectDeployment(ctx: CliContext, options: SelectOptions = {}): Promise<StoredBenchContext | null> {
  const projects = await getProjects();
  const choices = choicesFrom(projects);
  if (!choices.length) {
    if (options.optional) return null;
    throw new Error('No deployments found. Create a project or deployment first.');
  }

  let choice = findChoice(projects, options);
  if (!choice) {
    if (!canPrompt(ctx)) {
      if (options.optional) return null;
      throw new Error('Pass --deployment <id>, or --project <id> --mode <staging|production>.');
    }
    printBannerFor(ctx);
    log(ctx, section('Select Active Deployment'));
    choice = await promptForChoice(choices);
  }

  const next = contextFrom(choice);
  await writeBenchContext(next);

  if (ctx.json) {
    printJson({ ok: true, active: next });
    return next;
  }

  log(ctx, '');
  log(ctx, success('Active deployment selected.'));
  printActiveContext(ctx, next);
  return next;
}

export async function clearDeployment(ctx: CliContext): Promise<void> {
  await clearBenchContext();
  if (ctx.json) {
    printJson({ ok: true, active: null });
    return;
  }
  log(ctx, success('Active deployment cleared.'));
}

export async function createProjectCommand(ctx: CliContext, options: CreateProjectOptions): Promise<void> {
  const name = await promptText(ctx, options.name, 'Project name: ', 'Pass --name <name> to create a project.');
  const methods = validateMethods(
    await promptList(ctx, options.method, methodPrompt(DEPLOYMENT_AUTH_METHODS), defaultMethods(options.method)),
    DEPLOYMENT_AUTH_METHODS,
  );
  const project = await createProject(name, methods);
  const firstDeployment = project.deployment_items[0];
  if (firstDeployment && options.select !== false) {
    await writeBenchContext(contextFrom({ project, deployment: firstDeployment }));
  }

  if (ctx.json) {
    printJson({
      ok: true,
      project,
      active: firstDeployment && options.select !== false ? contextFrom({ project, deployment: firstDeployment }) : null,
    });
    return;
  }

  printBannerFor(ctx);
  log(ctx, section('Project Created'));
  log(ctx, field('Project', `${project.name} (${project.id})`));
  if (firstDeployment && options.select !== false) {
    log(ctx, field('Active deployment', `${firstDeployment.mode} (${firstDeployment.id})`));
  }
}

export async function createDeploymentCommand(ctx: CliContext, options: CreateDeploymentOptions): Promise<void> {
  const current = await readBenchContext();
  const projectId = await promptText(
    ctx,
    options.project ?? current?.project_id,
    'Project ID: ',
    'Pass --project <id>, or select an active deployment first.',
  );
  const mode = await promptChoice(
    ctx,
    options.mode,
    ['staging', 'production'],
    'Deployment mode: ',
    'Pass deployment mode: staging or production.',
  );
  const domain = mode === 'production'
    ? await promptText(ctx, options.domain, 'Production custom domain: ', 'Pass --domain <domain> when creating a production deployment.')
    : await promptOptionalText(ctx, options.domain, 'Custom domain, optional: ');
  const allowedMethods = mode === 'production' ? PRODUCTION_AUTH_METHODS : DEPLOYMENT_AUTH_METHODS;
  const methods = validateMethods(
    await promptList(ctx, options.method, methodPrompt(allowedMethods), defaultMethods(options.method)),
    allowedMethods,
  );

  const deployment = await createDeployment(projectId, mode, methods, domain);
  const project = (await getProjects()).find((item) => item.id === projectId);
  if (!project) {
    throw new Error('Deployment was created, but the project was not returned by /projects.');
  }
  const selectedProject = {
    ...project,
    deployment_items: project.deployment_items.some((item) => item.id === deployment.id)
      ? project.deployment_items
      : [...project.deployment_items, deployment],
  };
  const active = contextFrom({ project: selectedProject, deployment });
  if (options.select !== false) {
    await writeBenchContext(active);
  }

  if (ctx.json) {
    printJson({ ok: true, deployment, active: options.select !== false ? active : null });
    return;
  }

  printBannerFor(ctx);
  log(ctx, section('Deployment Created'));
  log(ctx, field('Project', `${project.name} (${project.id})`));
  log(ctx, field('Deployment', `${deployment.mode} (${deployment.id})`));
  if (options.select !== false) {
    log(ctx, field('Active', 'yes'));
  }
}
