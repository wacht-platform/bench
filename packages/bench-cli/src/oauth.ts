import { openBrowser } from './browser.js';
import {
  MACHINE_API_URL,
  OAUTH_AUTHORIZE_URL,
  OAUTH_CLIENT_ID,
  OAUTH_ISSUER,
  OAUTH_REVOCATION_URL,
  OAUTH_SCOPES,
  OAUTH_TOKEN_URL,
  REDIRECT_URI,
} from './config.js';
import { isOAuthTokenResponse } from './guards.js';
import { startOAuthCallbackServer } from './oauth-callback.js';
import { codeChallengeFor, randomToken } from './pkce.js';
import { clearAuth, readAuth, writeAuth } from './auth-store.js';
import { clearBenchContext, readBenchContext } from './context-store.js';
import type { CliContext, OAuthTokenResponse, StoredAuth } from './types.js';
import { command, field, log, printBannerFor, printJson, section, Spinner, success } from './ui.js';

const TOKEN_EXCHANGE_TIMEOUT_MS = 15_000;

function tokenExpiresAt(expiresIn: number | undefined): number {
  return Date.now() + Math.max(0, Number(expiresIn ?? 0) - 60) * 1000;
}

function scopesFrom(raw: string | undefined): string[] {
  const scopes = (raw || OAUTH_SCOPES).split(/\s+/).filter(Boolean);
  return scopes.length ? scopes : OAUTH_SCOPES.split(' ');
}

function fetchFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error && cause.message) {
    return `${error.message}: ${cause.message}`;
  }
  if (cause && typeof cause === 'object' && 'message' in cause) {
    return `${error.message}: ${String((cause as { message: unknown }).message)}`;
  }
  return error.message;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function exchangeToken(body: URLSearchParams): Promise<OAuthTokenResponse> {
  let response: Response;
  try {
    response = await postToken(body);
  } catch {
    await delay(500);
    try {
      response = await postToken(body);
    } catch (secondError) {
      throw new Error(
        `OAuth token endpoint was not reachable at ${OAUTH_TOKEN_URL}. ${fetchFailureMessage(secondError)}. Run \`wacht login\` again to request a fresh authorization code.`,
      );
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token exchange failed: HTTP ${response.status}${text ? ` ${text}` : ''}`);
  }

  const token: unknown = await response.json();
  if (!isOAuthTokenResponse(token)) {
    throw new Error('OAuth token exchange returned an unexpected response.');
  }
  return token;
}

async function postToken(body: URLSearchParams): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_EXCHANGE_TIMEOUT_MS);
  try {
    return await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshAuth(auth: StoredAuth): Promise<StoredAuth> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: auth.refresh_token,
    client_id: OAUTH_CLIENT_ID,
  });
  const token = await exchangeToken(body);
  const nextAuth: StoredAuth = {
    ...auth,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type,
    scope: token.scope,
    expires_at: tokenExpiresAt(token.expires_in),
    machine_api_url: MACHINE_API_URL,
    oauth_issuer: OAUTH_ISSUER,
  };
  await writeAuth(nextAuth);
  return nextAuth;
}

export async function getValidAuth(): Promise<StoredAuth> {
  const auth = await readAuth();
  if (!auth) {
    throw new Error('Not logged in. Run `wacht login`.');
  }
  if (auth.expires_at > Date.now()) {
    return auth;
  }
  return refreshAuth(auth);
}

export async function login(ctx: CliContext): Promise<void> {
  printBannerFor(ctx);
  const state = randomToken(24);
  const codeVerifier = randomToken(64);
  const codeChallenge = codeChallengeFor(codeVerifier);
  const authorizeUrl = new URL(OAUTH_AUTHORIZE_URL);
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: OAUTH_SCOPES,
    resource: MACHINE_API_URL,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).toString();

  const callback = startOAuthCallbackServer(state);
  await callback.ready;

  log(ctx, section('Browser Login'));
  log(ctx, 'Opening Wacht OAuth login in your browser.');
  log(ctx, field('Callback', REDIRECT_URI));
  log(ctx, '');
  log(ctx, 'If the browser does not open, visit:');
  log(ctx, command(authorizeUrl.toString()));
  log(ctx, '');
  openBrowser(authorizeUrl.toString());

  const authSpinner = new Spinner(ctx, 'Waiting for browser authorization').start();
  const code = await callback.code;
  authSpinner.succeed('Browser authorization received');

  const tokenSpinner = new Spinner(ctx, 'Exchanging authorization code').start();
  let token: OAuthTokenResponse;
  try {
    token = await exchangeToken(new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: OAUTH_CLIENT_ID,
      code_verifier: codeVerifier,
    }));
  } catch (error) {
    tokenSpinner.fail('Token exchange failed');
    throw error;
  }
  tokenSpinner.stop();

  await writeAuth({
    client_id: OAUTH_CLIENT_ID,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type,
    scope: token.scope,
    expires_at: tokenExpiresAt(token.expires_in),
    redirect_uri: REDIRECT_URI,
    machine_api_url: MACHINE_API_URL,
    oauth_issuer: OAUTH_ISSUER,
  });

  if (ctx.json) {
    printJson({
      ok: true,
      state: 'logged_in',
      scopes: scopesFrom(token.scope),
      machineApiUrl: MACHINE_API_URL,
    });
    return;
  }

  log(ctx, success('Logged in to Wacht Bench.'));
}

export async function logout(ctx: CliContext): Promise<void> {
  printBannerFor(ctx);
  const auth = await readAuth();
  if (auth?.refresh_token) {
    try {
      await fetch(OAUTH_REVOCATION_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: auth.refresh_token,
          token_type_hint: 'refresh_token',
          client_id: OAUTH_CLIENT_ID,
        }),
      });
    } catch {
      // Local logout should still succeed if the network is unavailable.
    }
  }
  await clearAuth();
  await clearBenchContext();
  if (ctx.json) {
    printJson({ ok: true, state: 'logged_out' });
    return;
  }
  log(ctx, success('Logged out of Wacht Bench.'));
}

export async function authStatus(ctx: CliContext): Promise<void> {
  printBannerFor(ctx);
  const auth = await readAuth();
  const active = await readBenchContext();
  if (!auth) {
    if (ctx.json) {
      printJson({ loggedIn: false, active });
      return;
    }
    log(ctx, 'Not logged in.');
    log(ctx, `Run ${command('wacht login')} to connect Bench.`);
    return;
  }

  const expiresAt = new Date(auth.expires_at).toISOString();
  if (ctx.json) {
    printJson({
      loggedIn: true,
      clientId: auth.client_id,
      scopes: scopesFrom(auth.scope),
      machineApiUrl: auth.machine_api_url,
      accessTokenExpiresAt: expiresAt,
      active,
    });
    return;
  }

  log(ctx, section('Auth Status'));
  log(ctx, field('State', success('logged in')));
  log(ctx, field('Client ID', auth.client_id));
  log(ctx, field('Scopes', auth.scope ?? OAUTH_SCOPES));
  log(ctx, field('Machine API', auth.machine_api_url));
  log(ctx, field('Access token expires', expiresAt));
  if (active) {
    log(ctx, field('Active project', `${active.project_name} (${active.project_id})`));
    log(ctx, field('Active deployment', `${active.deployment_mode} (${active.deployment_id})`));
  }
}
