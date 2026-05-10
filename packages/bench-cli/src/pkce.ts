import { createHash, randomBytes } from 'node:crypto';

export function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function randomToken(bytes = 32): string {
  return base64Url(randomBytes(bytes));
}

export function codeChallengeFor(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest());
}
