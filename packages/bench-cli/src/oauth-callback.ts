import { createServer } from 'node:http';
import type { Server } from 'node:http';

import { REDIRECT_PORT, REDIRECT_URI } from './config.js';
import type { OAuthCallbackHandle } from './types.js';

const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

function closePage(title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><script>window.close();setTimeout(function(){document.body.textContent='You can close this window.'},250);</script></head><body></body></html>`;
}

export function startOAuthCallbackServer(expectedState: string): OAuthCallbackHandle {
  let resolveCode!: (value: string) => void;
  let rejectCode!: (error: Error) => void;
  let settled = false;

  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server: Server = createServer((req, res) => {
    const finish = (error: Error | null, value?: string): void => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        // The server may not have started if binding the callback port failed.
      }
      if (error) {
        rejectCode(error);
      } else if (value) {
        resolveCode(value);
      } else {
        rejectCode(new Error('OAuth callback did not include a code'));
      }
    };

    const url = new URL(req.url ?? '/', REDIRECT_URI);
    if (req.method !== 'GET') {
      res.writeHead(405, {
        ...SECURITY_HEADERS,
        allow: 'GET',
      });
      res.end();
      return;
    }

    if (url.pathname !== '/callback') {
      res.writeHead(404, SECURITY_HEADERS);
      res.end();
      return;
    }

    const error = url.searchParams.get('error');
    if (error) {
      res.writeHead(400, {
        ...SECURITY_HEADERS,
        'content-type': 'text/html; charset=utf-8',
      });
      res.end(closePage('Wacht Bench login failed'));
      finish(new Error(`OAuth authorization failed: ${error}`));
      return;
    }

    const state = url.searchParams.get('state');
    if (state !== expectedState) {
      res.writeHead(400, {
        ...SECURITY_HEADERS,
        'content-type': 'text/html; charset=utf-8',
      });
      res.end(closePage('Wacht Bench login failed'));
      finish(new Error('OAuth callback state mismatch'));
      return;
    }

    const authCode = url.searchParams.get('code');
    if (!authCode) {
      res.writeHead(400, {
        ...SECURITY_HEADERS,
        'content-type': 'text/html; charset=utf-8',
      });
      res.end(closePage('Wacht Bench login failed'));
      finish(new Error('OAuth callback did not include a code'));
      return;
    }

    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': 'text/html; charset=utf-8',
    });
    res.end(closePage('Wacht Bench login complete'));
    finish(null, authCode);
  });

  const ready = new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
    server.once('error', (error) => {
      if (!settled) {
        settled = true;
        rejectCode(error);
      }
    });
    server.listen(REDIRECT_PORT, '127.0.0.1');
  });

  return { ready, code };
}
