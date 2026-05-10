import type { CliContext } from './types.js';

function color(code: number, value: string): string {
  return process.env.NO_COLOR === undefined && process.stdout.isTTY
    ? `\u001b[${code}m${value}\u001b[0m`
    : value;
}

export function muted(value: string): string {
  return color(90, value);
}

export function accent(value: string): string {
  return color(36, value);
}

export function strong(value: string): string {
  return color(1, value);
}

export function success(value: string): string {
  return color(32, value);
}

export function warning(value: string): string {
  return color(33, value);
}

export function failure(value: string): string {
  return color(31, value);
}

export function banner(): string {
  return [
    accent(' __      __        _     _     ____                  _     '),
    accent(' \\ \\    / /_ _ ___| |__ | |_  | __ )  ___ _ __   ___| |__  '),
    accent('  \\ \\/\\/ / _` / __| `_ \\| __| |  _ \\ / _ \\ `_ \\ / __| `_ \\ '),
    accent('   \\_/\\_/ (_| \\__ \\ | | | |_  | |_) |  __/ | | | (__| | | |'),
    accent('        \\__,_|___/_| |_|\\__| |____/ \\___|_| |_|\\___|_| |_|'),
    muted('        AI development workbench for Wacht'),
  ].join('\n');
}

export function printBanner(): void {
  console.log(banner());
  console.log('');
}

export function printBannerFor(ctx: CliContext): void {
  if (ctx.json || ctx.quiet || !ctx.banner) return;
  printBanner();
}

export function section(title: string): string {
  return strong(title);
}

export function command(value: string): string {
  return accent(value);
}

export function field(label: string, value: string): string {
  return `${muted(`${label}:`)} ${value}`;
}

export function printError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${failure('Error:')} ${message}`);
}

export function log(ctx: CliContext, message = ''): void {
  if (ctx.json || ctx.quiet) return;
  console.log(message);
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export class Spinner {
  private readonly enabled: boolean;
  private timer: NodeJS.Timeout | null = null;
  private index = 0;
  private readonly frames = ['-', '\\', '|', '/'];

  constructor(
    private readonly ctx: CliContext,
    private text: string,
  ) {
    this.enabled = process.stdout.isTTY && !ctx.json && !ctx.quiet;
  }

  start(): this {
    if (!this.enabled) return this;
    this.timer = setInterval(() => {
      process.stdout.write(`\r${accent(this.frames[this.index % this.frames.length])} ${this.text}`);
      this.index += 1;
    }, 80);
    return this;
  }

  update(text: string): void {
    this.text = text;
  }

  stop(message?: string): void {
    if (!this.enabled) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    process.stdout.write('\r\x1b[K');
    if (message) console.log(message);
  }

  succeed(message: string): void {
    this.stop(`${success('Done:')} ${message}`);
  }

  fail(message: string): void {
    this.stop(`${failure('Failed:')} ${message}`);
  }
}
