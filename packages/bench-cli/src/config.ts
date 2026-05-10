import os from 'node:os';
import path from 'node:path';

export const MCP_URL = 'https://wacht.dev/docs/mcp';
export const SKILLS_SOURCE = 'wacht-platform/bench';

export const OAUTH_CLIENT_ID = 'oc_SCoNL5oNiIiELWFhknqQsUvQ9FDrfMBC';
export const OAUTH_AUTHORIZE_URL = 'https://m2ma.wacht.dev/oauth/authorize';
export const OAUTH_TOKEN_URL = 'https://m2ma.wacht.dev/oauth/token';
export const OAUTH_REVOCATION_URL = 'https://m2ma.wacht.dev/oauth/revoke';
export const OAUTH_ISSUER = 'https://m2ma.wacht.dev';
export const OAUTH_SCOPES = 'read write';

export const MACHINE_API_URL = 'https://machine.wacht.dev';
export const PLATFORM_OPENAPI_URL = 'https://wacht.dev/docs/openapi/platform-api.json';

export const REDIRECT_PORT = 37819;
export const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;

export const AUTH_DIR = path.join(os.homedir(), '.wacht');
export const AUTH_FILE = path.join(AUTH_DIR, 'bench-auth.json');
export const CONTEXT_FILE = path.join(AUTH_DIR, 'bench-context.json');
export const OPENAPI_CACHE_FILE = path.join(AUTH_DIR, 'platform-api.openapi.json');
