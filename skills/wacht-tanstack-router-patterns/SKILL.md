---
name: wacht-tanstack-router-patterns
description: Use when implementing Wacht auth state, route guards, server functions, or protected routes in a TanStack Router app.
---

# Wacht TanStack Router Patterns

Use this skill for Wacht integrations in TanStack Router applications.

## Activation Rules

Use when the project has `@tanstack/react-router` and the task mentions route context, beforeLoad guards, loaders, server functions, or TanStack Router auth.

Do not use for React Router or Next.js projects.

## Grounding

Use Wacht Docs MCP to read the current TanStack Router quickstart, integration model, authentication, client auth, and server auth pages before editing.

Required docs:

- `/sdks/tanstack-router/quickstart`
- `/sdks/tanstack-router/authentication`
- `/sdks/tanstack-router/client-side-auth`
- `/sdks/tanstack-router/server-auth`

## Quick Reference

| Task | Pattern |
| --- | --- |
| Provider setup | Mount Wacht provider once around router/app shell |
| Route auth | Use route guards or `beforeLoad` with Wacht auth context |
| Protected server work | Use server auth helpers before data access |
| Client UX | Wacht hooks/components for signed-in state |
| Tenancy | Validate org/workspace context on the server |

## Workflow

1. Locate router creation, root route context, provider setup, and protected route boundaries.
2. Mount the Wacht provider once around the router.
3. Add auth checks in route guards or server functions where protected data is accessed.
4. Use Wacht hooks and components for signed-in state, account UI, and tenancy state.
5. Preserve existing route context types and loader behavior.

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Guard redirects but server function still runs | Server function lacks auth | Enforce auth at server boundary too. |
| Type errors in route context | Provider/auth state added outside router's expected context shape | Extend the existing context pattern instead of replacing it. |
| Tenant mismatch | Route params trusted as tenancy | Compare params against Wacht auth context server-side. |

## Validation

Run typecheck and the router test suite if present. Verify signed-out navigation, signed-in access, and protected server-side work.
