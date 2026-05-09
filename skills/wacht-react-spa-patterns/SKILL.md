---
name: wacht-react-spa-patterns
description: Use when implementing Wacht client-side auth, signed-in UI, account controls, or protected screens in a React SPA or Vite app.
---

# Wacht React SPA Patterns

Use this skill for React apps that do not use a supported full-stack framework adapter.

## Activation Rules

Use when the project is a client-rendered React app, Vite app, CRA app, or SPA without Next.js/React Router/TanStack server helpers.

Do not use when a full-stack Wacht adapter is available and already installed.

## Grounding

Use Wacht Docs MCP to read current React and shared SDK docs before choosing components, hooks, or environment variables.

Required docs:

- `/sdks/react/index`
- `/sdks/server`
- `/sdks/node/server-auth`
- `/guides/integration-playbooks/unsupported-stacks`

## Quick Reference

| Task | Pattern |
| --- | --- |
| App provider | Mount Wacht provider once in the React entry/root |
| Auth-aware UI | `SignedIn`, `SignedOut`, account controls, hooks |
| Protected screen | Client route/screen gating for UX only |
| Protected data | Backend route must enforce Wacht auth |
| Tenant UI | Organization/workspace hooks and switchers |

## Workflow

1. Find the top-level React render and provider tree.
2. Mount the Wacht provider once.
3. Use signed-in and signed-out UI controls for screen-level gating.
4. Use hooks for user, session, organization, workspace, notifications, and navigation state.
5. Treat SPA checks as UX only. Enforce protected data and mutations on the backend.

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Protected page hidden but API still leaks | Client-only route guard | Add backend auth enforcement. |
| Auth state flickers badly | App renders before deployment initialization | Use the SDK initialization/loading pattern. |
| Sign-in redirect loops | Redirect URL or deployment setting mismatch | Check deployment UI settings and navigation helper usage. |
| Server key in Vite env | Used `VITE_` secret | Keep secrets server-side only. |

## Validation

Run typecheck and frontend tests. Verify loading state, signed-out state, signed-in state, and failed backend authorization behavior.
