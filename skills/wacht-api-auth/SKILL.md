---
name: wacht-api-auth
description: Use when implementing Wacht API Auth apps, API keys, OAuth clients, gateway checks, audit logs, or hosted and custom API auth management flows.
---

# Wacht API Auth

Use this skill for machine access, customer-managed API keys, OAuth clients, and gateway authorization.

## Activation Rules

Use when the task mentions API keys, machine credentials, OAuth clients, customer developer settings, gateway checks, API Auth apps, audit logs, API key analytics, or vanity/custom API key management.

Do not use for normal user session auth unless API keys or OAuth clients are also involved.

## Grounding

Use Wacht Docs MCP to read current API Auth guides, backend SDK methods, and API reference operations before coding.

Required docs:

- `/guides/api-auth/overview`
- `/guides/api-auth/vanity-pages-implementation`
- `/guides/api-auth/custom-hook-flow-implementation`
- backend SDK/API reference for API Auth and API Keys

## Mental Model

API Auth has two separate surfaces:

1. Management surface: authenticated users manage API keys/OAuth clients through short-lived tickets.
2. Gateway surface: incoming machine requests are authorized with API keys or OAuth access tokens.

Never let the frontend mint management access directly. Your backend is the policy authority.

### Two kinds of API Auth apps per deployment

Every deployment surface shows API Auth apps to the developer, but two distinct kinds exist:

| Kind | Slug pattern | Origin | Purpose |
| --- | --- | --- | --- |
| **System / backend app** | `aa_<deployment_id>` | Auto-provisioned at deployment creation | Holds the key your own backend (`@wacht/backend`, `WACHT_API_KEY`) uses to talk to its deployment. The backend router derives `deployment_id` from the key's slug, so this exact pattern is load-bearing. |
| **Customer apps** | Any user-chosen slug | Created by the developer in the console (or via `createApiAuthApp`) | Surfaces customers' own gateway-protected APIs, with custom permissions/resources/rate limits. |

When you need the deployment's own backend API key (e.g. populating `WACHT_API_KEY` for a Next.js scaffold), prefer the Bench CLI: `wacht env pull` mints a fresh key under the system app and writes `.env.local`. Don't try to issue or rotate keys against `aa_<id>` from custom code — the system app is treated as platform-owned.

## Quick Reference

| Task | Pattern |
| --- | --- |
| Ship quickly | Vanity management surface + short-lived ticket |
| Deep product integration | Custom hook-based key management UI |
| Create API Auth app | Backend SDK with server API key |
| Let user manage keys | Backend issues `api_auth_access` ticket |
| Protect customer API | Gateway authorization check |
| Support/security visibility | Audit logs, analytics, timeseries |

## Workflow

1. Identify whether the UX is hosted vanity pages or custom in-app management.
2. Create management tickets only from trusted backend code.
3. Scope API auth resources to the correct deployment, organization, workspace, or actor.
4. Use gateway authorization checks for incoming machine requests.
5. Store and display only safe key metadata after key creation.
6. Include audit logs and timeseries where the user is building operator visibility.

## End-to-End Blueprint

1. Provision an API Auth app.
2. Define who can manage keys in your product RBAC.
3. Add a backend ticket issuance endpoint.
4. Choose vanity embed or custom management UI.
5. Add gateway checks to protected machine routes.
6. Add audit and analytics screens if operators need visibility.

## Minimal Provisioning Pattern

```ts
import { WachtClient } from '@wacht/backend';

const client = new WachtClient({
  apiKey: process.env.WACHT_API_KEY!,
});

await client.apiKeys.createApiAuthApp({
  app_slug: 'aa_42',
  name: 'Acme Public API',
  key_prefix: 'acme_live',
  description: 'API keys for Acme customers',
});
```

## Decision Matrix

| Constraint | Prefer vanity | Prefer custom |
| --- | --- | --- |
| Fast launch | Yes | No |
| Existing settings IA | Maybe | Yes |
| Complex approvals | No | Yes |
| Low maintenance | Yes | No |
| Full UX control | No | Yes |

## References

- `references/management-flow.md`
- `references/gateway-authorization.md`

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Any signed-in user can manage keys | Ticket endpoint lacks RBAC | Enforce tenant membership and permission before ticket issuance. |
| Secret value displayed later | Stored raw API key | Store/display only safe metadata after initial creation. |
| API key works across tenants | Missing principal tenant scoping | Scope gateway result to org/workspace/actor before data access. |
| Frontend calls management APIs without ticket | Trust boundary collapsed | Issue short-lived ticket from backend only. |

## Validation

Run backend and frontend checks. Test key creation, key revocation, invalid key, missing permission, valid authorized request, and tenant isolation.
