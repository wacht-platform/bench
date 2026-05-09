---
name: wacht-react-router-patterns
description: Use when implementing Wacht providers, auth state, server auth, loaders, actions, or route guards in a React Router app.
---

# Wacht React Router Patterns

Use this skill for Wacht integrations in React Router applications.

## Activation Rules

Use when the project has `react-router` and the task mentions loaders, actions, route modules, SSR, route protection, or React Router server auth.

Do not use for Next.js or TanStack Router projects.

## Grounding

Use Wacht Docs MCP to read the current React Router quickstart, integration model, authentication, client auth, and server auth pages before editing.

Required docs:

- `/sdks/react-router/quickstart`
- `/sdks/react-router/authentication`
- `/sdks/react-router/client-side-auth`
- `/sdks/react-router/server-auth`

## Quick Reference

| Task | Pattern |
| --- | --- |
| App provider | Mount Wacht provider once near root route/app shell |
| Optional auth in loader/action | `getAuth(request)` |
| Strict auth in loader/action | `requireAuth(request)` |
| Full request auth and headers | `authenticateRequest(request)` and forward returned headers |
| Client UI | signed-in/signed-out components and account controls |
| Backend API calls | framework server client or `@wacht/backend` |

## Workflow

1. Locate router setup, root route, providers, loaders, and actions.
2. Mount the Wacht deployment provider once at the app root.
3. Use Wacht hooks and signed-in or signed-out controls for client UI.
4. Enforce auth in loaders and actions before reading or mutating protected data.
5. Forward any auth response headers required by Wacht server helpers.
6. Keep server-only keys out of browser code.

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Auth works in component but loader leaks data | Loader lacks server auth | Call `requireAuth(request)` before loading protected data. |
| Session does not persist correctly | Returned auth headers dropped | Forward headers from full request authentication helpers. |
| Action mutation works while signed out | Only route UI was gated | Enforce auth inside the action. |
| Wrong tenant data after switching | Loader query ignores active org/workspace | Scope server queries with auth tenancy context. |

## Validation

Run typecheck and route tests if available. Cover unauthenticated loader/action access, authenticated access, and organization or workspace context when the feature is tenant-scoped.
