import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ProjectProfile {
  root: string;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';
  frameworks: string[];
  suggestedSkills: string[];
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

async function fileText(root: string, relativePath: string): Promise<string | null> {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch {
    return null;
  }
}

async function readPackageJson(root: string): Promise<PackageJson | null> {
  const raw = await fileText(root, 'package.json');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

async function detectPackageManager(root: string): Promise<ProjectProfile['packageManager']> {
  if (await fileText(root, 'pnpm-lock.yaml')) return 'pnpm';
  if (await fileText(root, 'yarn.lock')) return 'yarn';
  if (await fileText(root, 'bun.lock') || await fileText(root, 'bun.lockb')) return 'bun';
  if (await fileText(root, 'package-lock.json')) return 'npm';
  return 'unknown';
}

function hasDependency(pkg: PackageJson | null, name: string): boolean {
  return !!pkg?.dependencies?.[name] || !!pkg?.devDependencies?.[name];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export async function detectProject(root: string): Promise<ProjectProfile> {
  const pkg = await readPackageJson(root);
  const frameworks: string[] = [];
  const suggestedSkills = ['wacht', 'wacht-setup'];

  if (hasDependency(pkg, 'next')) {
    frameworks.push('Next.js');
    suggestedSkills.push('wacht-nextjs-patterns');
  }
  if (hasDependency(pkg, 'react-router') || hasDependency(pkg, '@react-router/dev')) {
    frameworks.push('React Router');
    suggestedSkills.push('wacht-react-router-patterns');
  }
  if (hasDependency(pkg, '@tanstack/react-router')) {
    frameworks.push('TanStack Router');
    suggestedSkills.push('wacht-tanstack-router-patterns');
  }
  if (hasDependency(pkg, '@wacht/backend')) {
    suggestedSkills.push('wacht-backend-js', 'wacht-api-auth');
  }

  return {
    root,
    packageManager: await detectPackageManager(root),
    frameworks: unique(frameworks),
    suggestedSkills: unique(suggestedSkills),
  };
}
