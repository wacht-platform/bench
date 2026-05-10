import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import type { CliContext } from './types.js';

export function canPrompt(ctx: CliContext): boolean {
  return ctx.interactive && process.stdin.isTTY && process.stdout.isTTY;
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function promptText(
  ctx: CliContext,
  value: string | undefined,
  question: string,
  missingMessage: string,
): Promise<string> {
  if (value && value.trim()) return value.trim();
  if (!canPrompt(ctx)) throw new Error(missingMessage);

  const answer = await ask(question);
  if (!answer) throw new Error(missingMessage);
  return answer;
}

export async function promptOptionalText(
  ctx: CliContext,
  value: string | undefined,
  question: string,
): Promise<string | undefined> {
  if (value && value.trim()) return value.trim();
  if (!canPrompt(ctx)) return undefined;

  const answer = await ask(question);
  return answer || undefined;
}

export async function promptChoice(
  ctx: CliContext,
  value: string | undefined,
  choices: string[],
  question: string,
  missingMessage: string,
): Promise<string> {
  if (value) {
    if (!choices.includes(value)) {
      throw new Error(`${missingMessage} Allowed values: ${choices.join(', ')}.`);
    }
    return value;
  }
  if (!canPrompt(ctx)) throw new Error(missingMessage);

  for (const [index, choice] of choices.entries()) {
    console.log(`${index + 1}. ${choice}`);
  }
  console.log('');
  const answer = await ask(question);
  const index = Number.parseInt(answer, 10) - 1;
  if (Number.isInteger(index) && index >= 0 && index < choices.length) {
    return choices[index];
  }
  if (choices.includes(answer)) return answer;
  throw new Error(`${missingMessage} Allowed values: ${choices.join(', ')}.`);
}

export async function promptList(
  ctx: CliContext,
  values: string[] | undefined,
  question: string,
  fallback: string[],
): Promise<string[]> {
  if (values && values.length) return values;
  if (!canPrompt(ctx)) return fallback;

  const answer = await ask(question);
  if (!answer) return fallback;
  return answer.split(',').map((item) => item.trim()).filter(Boolean);
}

export async function promptOptionalList(
  ctx: CliContext,
  values: string[] | undefined,
  question: string,
): Promise<string[]> {
  if (values && values.length) return values;
  if (!canPrompt(ctx)) return [];

  const answer = await ask(question);
  if (!answer) return [];
  return answer.split(',').map((item) => item.trim()).filter(Boolean);
}

export interface MultiSelectItem {
  value: string;
  label: string;
  hint?: string;
  preselected?: boolean;
}

function expandRange(token: string, max: number): number[] {
  const range = token.match(/^(\d+)-(\d+)$/);
  if (range) {
    const start = Math.max(1, Number.parseInt(range[1], 10));
    const end = Math.min(max, Number.parseInt(range[2], 10));
    const result: number[] = [];
    for (let i = start; i <= end; i += 1) result.push(i - 1);
    return result;
  }
  const single = Number.parseInt(token, 10);
  if (Number.isInteger(single) && single >= 1 && single <= max) return [single - 1];
  return [];
}

export async function promptMultiSelect(
  ctx: CliContext,
  items: MultiSelectItem[],
  question: string,
): Promise<string[]> {
  if (!canPrompt(ctx)) {
    return items.filter((item) => item.preselected).map((item) => item.value);
  }

  const selected = new Set<number>();
  items.forEach((item, index) => {
    if (item.preselected) selected.add(index);
  });

  while (true) {
    console.log('');
    items.forEach((item, index) => {
      const mark = selected.has(index) ? '[x]' : '[ ]';
      const hint = item.hint ? ` [90m${item.hint}[0m` : '';
      console.log(`  ${mark} ${index + 1}. ${item.label}${hint}`);
    });
    console.log('');
    console.log('  Toggle by number/range (e.g. "1,3-5"), "all", "none", or press Enter to confirm.');
    const answer = (await ask(`${question} `)).trim();
    if (!answer) break;
    const lower = answer.toLowerCase();
    if (lower === 'all') {
      items.forEach((_, index) => selected.add(index));
      continue;
    }
    if (lower === 'none' || lower === 'clear') {
      selected.clear();
      continue;
    }
    if (lower === 'done' || lower === 'ok') break;
    const tokens = answer.split(/[\s,]+/).filter(Boolean);
    for (const token of tokens) {
      const indices = expandRange(token, items.length);
      for (const idx of indices) {
        if (selected.has(idx)) selected.delete(idx);
        else selected.add(idx);
      }
    }
  }

  return [...selected].map((idx) => items[idx].value);
}

export async function promptConfirm(
  ctx: CliContext,
  question: string,
  defaultYes = true,
): Promise<boolean> {
  if (!canPrompt(ctx)) return defaultYes;
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  const answer = (await ask(`${question}${suffix}`)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}
