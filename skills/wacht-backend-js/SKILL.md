---
name: wacht-backend-js
description: Use when implementing server-side Wacht auth, backend SDK clients, token verification, gateway authorization, or webhooks in JavaScript or TypeScript services.
---

# Wacht Backend JS

Use this skill for Node.js, Bun, Deno, Hono, serverless, or framework backend code using `@wacht/backend`.

## Activation Rules

Use when the task touches backend JavaScript or TypeScript auth, Wacht server clients, token verification, gateway authorization, webhook signature verification, or server-side Wacht management APIs.

Do not use for framework-specific server helpers in Next.js, React Router, or TanStack Router unless the task explicitly asks for standalone `@wacht/backend` usage.

## Grounding

Use Wacht Docs MCP to read the current Backend JS docs and the relevant runtime guide before coding.

Required docs:

- `/sdks/node`
- `/sdks/node/server-auth`
- runtime-specific pages under `/sdks/node/runtimes/*`
- backend API reference pages for the resource being called

## Quick Reference

| Task | Helper or pattern |
| --- | --- |
| Call any platform API | `import { ai, users, … } from '@wacht/backend'; await ai.createActor(req)` — the global client lazy-inits from `WACHT_API_KEY` |
| Override client config | `initClient({ apiKey, baseUrl })` once at startup |
| Multiple deployments / explicit client | `new WachtClient({ apiKey })`, pass as 2nd arg to functions |
| Request auth | `authenticateRequest(request, options?)` |
| Optional auth | `getAuth(request, options?)` |
| Serialized auth | `authFromHeaders(headers, options?)` |
| Raw token verification | `verifyAuthToken(token, options?)` |
| API key/OAuth gateway | `gateway` API group |
| Webhook verification | Verify the raw body with the project's Wacht webhook signing helper or documented receiver pattern |

## Workflow

1. Locate the existing server client pattern, environment loader, and request auth middleware.
2. Use one consistent `@wacht/backend` client initialization path.
3. Verify session or JWT tokens before protected user routes.
4. Use gateway authorization helpers for API key or OAuth protected machine routes.
5. Verify webhook signatures before parsing or trusting webhook payloads.
6. Return consistent 401, 403, and validation errors using the app's existing error style.

## Minimal Patterns

### Client Setup

The default client lazy-initializes from `WACHT_API_KEY` and uses `https://api.wacht.dev` the first time any SDK function runs. No setup call is needed in the common case:

```ts
import { users } from '@wacht/backend';

const response = await users.listUsers({ limit: 20 });
```

Call `initClient()` only when you need to inject runtime-specific options such as a custom `fetch` for Cloudflare Workers:

```ts
import { initClient, users } from '@wacht/backend';

initClient({
  apiKey: env.WACHT_API_KEY,
  fetch: env.fetch.bind(env),
});

await users.listUsers({ limit: 20 });
```

Do not set `WACHT_BACKEND_API_URL` from a deployment `backend_host`/`fapi.trywacht.xyz` value. That host is for deployment frontend/runtime traffic, not the backend SDK API.

### Request Auth

```ts
import { authenticateRequest } from '@wacht/backend';

export async function handler(request: Request) {
  const auth = await authenticateRequest(request, {
    signInUrl: 'https://app.example.com/sign-in',
  });

  await auth.protect({ permission: 'user:read' });

  return Response.json({ userId: auth.userId });
}
```

### Token Verification

```ts
import { verifyAuthToken } from '@wacht/backend';

const claims = await verifyAuthToken(token);
if (!claims) {
  return new Response('Unauthorized', { status: 401 });
}
```

## Decision Tree

| Situation | Use |
| --- | --- |
| Standard Node / Next.js / Hono / Bun server with `WACHT_API_KEY` set | Just import functions — default client lazy-inits. |
| Workers / Deno / runtime without `process.env` | `initClient({ apiKey, fetch })` once with runtime bindings. |
| Multiple deployments in one process | Construct named `WachtClient` instances and pass explicitly. |
| Browser session protected backend route | `authenticateRequest()` or `getAuth()`. |
| Customer API key protected endpoint | Gateway authorization, not session auth. |
| Webhook receiver | Signature verification before JSON parsing/trust. |

## References

- `references/auth-and-gateway.md`
- `references/runtime-patterns.md`

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Works locally but fails in Workers | Node env assumptions | Pass `publishableKey` and API keys from runtime bindings. |
| Every handler creates inconsistent clients | Mixed global and explicit patterns | Pick one client pattern per app/service. |
| API key accepted as user session | Wrong auth path | Use gateway checks for machine credentials. |
| Webhook handler trusts forged JSON | Parsed body before verification | Verify signature against raw body first. |

## Validation

Run typecheck and backend tests. Add or update tests for missing token, invalid token, insufficient permissions, and successful authorized request.
