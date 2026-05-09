#!/usr/bin/env node

import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const skillsDir = path.join(root, 'skills');
const docsDir = path.resolve(root, '../wacht-docs/content/docs');
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fields = {};
  for (const line of match[1].split('\n')) {
    const keyValue = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!keyValue) continue;
    const [, key, value] = keyValue;
    fields[key] = value.replace(/^["']|["']$/g, '').trim();
  }
  return fields;
}

const entries = await readdir(skillsDir, { withFileTypes: true });
const skillDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

if (skillDirs.length === 0) {
  throw new Error('No skills found in skills/.');
}

const failures = [];
const descriptions = new Map();
const docsDirExists = await exists(docsDir);

if (!docsDirExists) {
  failures.push(
    `Wacht docs directory not found at ${docsDir}; check out wacht-docs next to this repo so Required docs paths can be validated.`,
  );
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractRequiredDocs(raw) {
  const match = raw.match(/Required docs:\n\n((?:- `\/[^`]+`\n?)+)/);
  if (!match) return [];
  return [...match[1].matchAll(/- `(\/[^`]+)`/g)].map((item) => item[1]);
}

function extractReferenceLinks(raw) {
  return [...raw.matchAll(/`(references\/[^`]+)`/g)].map((item) => item[1]);
}

for (const skillName of skillDirs) {
  if (!namePattern.test(skillName)) {
    failures.push(`${skillName}: directory name must be lowercase hyphen-case`);
    continue;
  }

  let raw;
  try {
    raw = await readFile(path.join(skillsDir, skillName, 'SKILL.md'), 'utf8');
  } catch {
    failures.push(`${skillName}: missing SKILL.md`);
    continue;
  }

  const frontmatter = parseFrontmatter(raw);
  if (!frontmatter) {
    failures.push(`${skillName}: missing YAML frontmatter`);
    continue;
  }

  if (frontmatter.name !== skillName) {
    failures.push(`${skillName}: frontmatter name must match directory name`);
  }

  if (!frontmatter.description || frontmatter.description.length < 40) {
    failures.push(`${skillName}: description must explain when to use the skill`);
  } else if (descriptions.has(frontmatter.description)) {
    failures.push(`${skillName}: duplicate description also used by ${descriptions.get(frontmatter.description)}`);
  } else {
    descriptions.set(frontmatter.description, skillName);
  }

  if (!raw.includes('Wacht Docs MCP')) {
    failures.push(`${skillName}: must mention Wacht Docs MCP`);
  }

  if (raw.includes('Useful docs')) {
    failures.push(`${skillName}: use "Required docs:" instead of "Useful docs:"`);
  }

  const requiredDocs = extractRequiredDocs(raw);
  if (requiredDocs.length < 2) {
    failures.push(`${skillName}: must list at least two Required docs paths`);
  }

  for (const docsPath of requiredDocs) {
    const normalized = docsPath.replace(/^\/docs\//, '/').replace(/\/$/, '');
    const docFile = path.join(docsDir, `${normalized}.mdx`);
    const docIndexFile = path.join(docsDir, normalized, 'index.mdx');
    if (docsDirExists && !(await exists(docFile)) && !(await exists(docIndexFile))) {
      failures.push(`${skillName}: Required docs path does not exist: ${docsPath}`);
    }
  }

  for (const ref of extractReferenceLinks(raw)) {
    const refFile = path.join(skillsDir, skillName, ref);
    if (!(await exists(refFile))) {
      failures.push(`${skillName}: referenced file does not exist: ${ref}`);
    }
  }

  if (/wacht\s*=\s*"0\.\d+\.\d/.test(raw) || /version\s*=\s*"0\.\d+\.\d/.test(raw)) {
    failures.push(`${skillName}: avoid hardcoded Wacht crate versions; point to Required docs instead`);
  }
}

if (failures.length > 0) {
  console.error('Skill validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Validated ${skillDirs.length} Wacht skills.`);
