export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface StoredAuth {
  client_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope?: string;
  expires_at: number;
  redirect_uri: string;
  machine_api_url: string;
  oauth_issuer: string;
}

export interface StoredBenchContext {
  project_id: string;
  project_name: string;
  deployment_id: string;
  deployment_mode: string;
  deployment_backend_host?: string;
  deployment_frontend_host?: string;
  updated_at: number;
}

export interface OAuthCallbackHandle {
  ready: Promise<void>;
  code: Promise<string>;
}

export interface CliContext {
  json: boolean;
  quiet: boolean;
  banner: boolean;
  interactive: boolean;
}

export type JsonObject = Record<string, unknown>;
