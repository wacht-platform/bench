// Shared HTTP layer: every network call in the CLI goes through `httpFetch` so
// no request can hang an agent loop forever, and transient blips on idempotent
// reads retry instead of failing the whole command.

const DEFAULT_TIMEOUT_MS = (() => {
  const raw = Number(process.env.WACHT_HTTP_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 20_000;
})();

const DEFAULT_RETRIES = 2;
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD']);

export interface HttpOptions {
  /** Abort the request after this many ms. Defaults to $WACHT_HTTP_TIMEOUT_MS or 20s. */
  timeoutMs?: number;
  /** Max retries on transient failure. Defaults to 2 for GET/HEAD, 0 for mutations. */
  retries?: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function methodOf(init: RequestInit): string {
  return (init.method ?? 'GET').toUpperCase();
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `fetch` with a hard timeout and bounded retries. Mutations (POST/PUT/PATCH/DELETE)
 * are never retried automatically — only idempotent reads — so a flaky network can't
 * double-apply a write. Non-retryable responses (including 4xx) are returned as-is so
 * callers keep their own status handling.
 */
export async function httpFetch(
  url: string | URL,
  init: RequestInit = {},
  opts: HttpOptions = {},
): Promise<Response> {
  const target = String(url);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idempotent = IDEMPOTENT_METHODS.has(methodOf(init));
  const maxRetries = Math.max(0, opts.retries ?? (idempotent ? DEFAULT_RETRIES : 0));

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (isRetryableStatus(response.status) && attempt < maxRetries) {
        await delay(200 * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      // A timeout means we already waited the full budget — retrying just
      // multiplies the wait, so fail fast and let the per-request timeout cap it.
      // Connection errors (refused/reset/DNS) are cheap to retry and often transient.
      if (!timedOut && attempt < maxRetries) {
        await delay(200 * (attempt + 1));
        continue;
      }
      if (timedOut) {
        throw new HttpError(`request timed out after ${timeoutMs}ms: ${target}`, target);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new HttpError(`request failed: ${message} (${target})`, target);
    } finally {
      clearTimeout(timer);
    }
  }
}
