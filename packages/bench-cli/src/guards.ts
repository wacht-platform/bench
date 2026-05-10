import type { JsonObject, OAuthTokenResponse, StoredAuth } from './types.js';

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStoredAuth(value: unknown): value is StoredAuth {
  return isJsonObject(value)
    && typeof value.client_id === 'string'
    && typeof value.access_token === 'string'
    && typeof value.refresh_token === 'string'
    && typeof value.token_type === 'string'
    && typeof value.expires_at === 'number'
    && typeof value.redirect_uri === 'string'
    && typeof value.machine_api_url === 'string'
    && typeof value.oauth_issuer === 'string'
    && (value.scope === undefined || typeof value.scope === 'string');
}

export function isOAuthTokenResponse(value: unknown): value is OAuthTokenResponse {
  return isJsonObject(value)
    && typeof value.access_token === 'string'
    && typeof value.token_type === 'string'
    && typeof value.expires_in === 'number'
    && typeof value.refresh_token === 'string'
    && typeof value.scope === 'string';
}
