import { spawn } from 'node:child_process';

import { SKILLS_SOURCE } from './config.js';
import { valueAfter } from './util.js';

export type InstallSkillsOptions = {
  skill?: string;
  agents?: string[];
  allAgents?: boolean;
  global?: boolean;
  yes?: boolean;
  copy?: boolean;
};

export function installSkills(options: InstallSkillsOptions = {}): Promise<void> {
  const installArgs = ['skills', 'add', SKILLS_SOURCE];

  if (options.allAgents) {
    installArgs.push('-a', '*');
  } else if (options.agents && options.agents.length > 0) {
    installArgs.push('-a', ...options.agents);
  }

  if (options.skill) installArgs.push('-s', options.skill);
  if (options.global) installArgs.push('-g');
  if (options.yes) installArgs.push('-y');
  if (options.copy) installArgs.push('--copy');

  return new Promise((resolve, reject) => {
    const child = spawn('npx', installArgs, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Skill install interrupted by ${signal}`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Skill install failed with exit code ${code ?? 1}`));
    });
  });
}

export async function skillsInstall(args: string[]): Promise<void> {
  await installSkills({ skill: valueAfter(args, '--skill') });
}
