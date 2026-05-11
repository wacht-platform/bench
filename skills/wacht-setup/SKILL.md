---
name: wacht-setup
description: Use when adding Wacht to a new or existing app, detecting the framework, selecting SDK packages, and creating a first working integration.
---

# Wacht Setup

Use this skill when a project does not yet have a clear Wacht integration or the user asks to add Wacht from scratch.

## Activation Rules

Use when the task says "add Wacht", "set up Wacht", "install Wacht", "integrate Wacht", "replace auth with Wacht", or when no specialized Wacht skill clearly matches yet.

Do not use as the primary skill after the framework is known and the task is about a specific advanced workflow. Route to the framework or feature skill.

## Grounding

Use Wacht Docs MCP before selecting packages or file locations. Search for the target framework quickstart and the current environment variable requirements.

Required docs:

- `/sdks/nextjs/quickstart`
- `/sdks/react-router/quickstart`
- `/sdks/tanstack-router/quickstart`
- `/sdks/node/index`
- `/sdks/rust/getting-started`

## Quick Reference

| Signal | Framework | Package | Next skill |
| --- | --- | --- | --- |
| `next` dependency, `app/`, `pages/`, `next.config.*` | Next.js | `@wacht/nextjs @wacht/types` | `wacht-nextjs-patterns` |
| `react-router` dependency, route loaders/actions | React Router | `@wacht/react-router @wacht/types` | `wacht-react-router-patterns` |
| `@tanstack/react-router` dependency | TanStack Router | `@wacht/tanstack-router @wacht/types` | `wacht-tanstack-router-patterns` |
| Node server package, Hono, Express, Fastify, Workers | Backend JS | `@wacht/backend` | `wacht-backend-js` |
| `Cargo.toml`, Axum routes | Rust | `wacht` crate | `wacht-rust-axum` |

## Framework Detection

Inspect in this order:

1. `package.json`, `pnpm-workspace.yaml`, `turbo.json`, or workspace manifests.
2. `app/`, `pages/`, `src/routes`, `src/router`, `routes.tsx`, route loaders/actions.
3. Server entrypoints such as `src/server.ts`, `worker.ts`, `api/`, `functions/`.
4. Existing auth provider code and env usage.

Read `references/framework-detection.md` for deeper detection and package selection.

## Workflow

1. Detect the framework and router from package manifests and source files.
2. Pick the narrowest Wacht package:
   - Next.js: `@wacht/nextjs`
   - React Router: `@wacht/react-router`
   - TanStack Router: `@wacht/tanstack-router`
   - Server JS: `@wacht/backend`
   - Rust: `wacht`
3. Identify where app providers, route guards, server handlers, and environment config already live.
4. Add only the minimum Wacht setup needed for the user's goal.
5. **Populate credentials with `wacht env pull`** instead of asking the user to paste keys from the console. It writes `.env.local` automatically. See `wacht-bench-cli` for details.
6. Hand off to the framework-specific Wacht skill for detailed implementation.

## Populating credentials

The Bench CLI auto-provisions credentials from the active deployment. Prefer this over hand-pasting from the console:

```bash
wacht login                # one-time per machine
wacht deployments select   # pick the deployment
wacht env pull             # writes publishable + API key to .env.local
```

What `wacht env pull` writes (framework-detected):

| Framework | Public key var |
| --- | --- |
| Next.js | `NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY` |
| React Router / TanStack Router | `VITE_WACHT_PUBLISHABLE_KEY` |
| Other | `NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY` (default) |

`WACHT_API_KEY` is the server-side backend key (`sk_test_…` on staging, `sk_live_…` on production). Every `env pull` mints a fresh key; existing keys keep working until revoked from the console.

## Minimal Setup Patterns

### Next.js

```bash
pnpm add @wacht/nextjs @wacht/types
```

Required env (prefer `wacht env pull` to populate these):

```bash
NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY=pk_test_…    # public, ships in the browser bundle
WACHT_API_KEY=sk_test_…                        # sk_live_… on production deployments
```

Mount `DeploymentProvider` once and add `wachtMiddleware()` in `proxy.ts` for Next.js 16 or `middleware.ts` for older versions.

### Backend JS

```bash
pnpm add @wacht/backend
```

Required env:

```bash
WACHT_API_KEY=sk_test_…                        # sk_live_… on production deployments
WACHT_BACKEND_API_URL=https://...
```

### Rust

Before editing `Cargo.toml`, fetch `/sdks/rust/getting-started` through Wacht Docs MCP and copy the current `wacht` crate version from that page.

Add `wacht` with the current docs version and keep the service's existing Tokio setup. Do not leave placeholder versions in committed TOML.

For Axum, enable the `axum` feature on the `wacht` dependency after resolving the current crate version from the docs.

## Required Checks

- Confirm no duplicate provider mount is introduced.
- Confirm publishable keys are used only in client-safe settings.
- Confirm server API keys are only read server-side.
- Run the repo's typecheck and relevant tests.

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Auth UI loads but API routes are unprotected | Only client components were added | Add server auth enforcement in route handlers/actions. |
| Secret visible in browser bundle | `WACHT_API_KEY` used in client code | Move to server-only module and public key only uses public env name. |
| Middleware not running | Wrong file name or matcher | Use `proxy.ts` for Next.js 16, `middleware.ts` for older Next.js, and include API route matchers. |
| Wacht state appears twice | Provider mounted multiple times | Mount the deployment provider once at the app root. |
