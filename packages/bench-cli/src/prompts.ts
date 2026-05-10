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
