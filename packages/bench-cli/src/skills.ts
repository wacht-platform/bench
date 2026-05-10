import { spawn } from 'node:child_process';

import { SKILLS_SOURCE } from './config.js';
import { valueAfter } from './util.js';

export function installSkills(skill?: string): Promise<void> {
  const installArgs = ['skills', 'add', SKILLS_SOURCE];
  if (skill) installArgs.push('--skill', skill);

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
  await installSkills(valueAfter(args, '--skill'));
}
