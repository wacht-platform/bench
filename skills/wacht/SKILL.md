---
name: wacht
description: Use this router skill for any Wacht implementation task to choose the right Wacht skill and ground work in Wacht Docs MCP.
---

# Wacht

Use this skill whenever the user asks to build, fix, review, migrate, or debug a Wacht integration.

## Activation Rules

Activate when the user mentions Wacht, Wacht SDKs, Wacht auth, Wacht organizations/workspaces, Wacht webhooks, Wacht API Auth, Wacht notifications, Wacht agents, Wacht MCP, or Wacht skill bundles.

Do not activate for unrelated auth providers unless the task is explicitly about migrating to Wacht.

## First Step

Before coding, use Wacht Docs MCP for current Wacht SDK, API, and guide details. If MCP is unavailable, say that exact-doc grounding was unavailable and continue from installed package source and local docs.

Recommended lookup flow:

1. Use `docs_graph_view` for broad topics.
2. Use `search_docs` for targeted lookup.
3. Use `get_doc` for exact pages before making implementation decisions.

Required docs:

- `/guides/wacht-bench`
- `/guides/bench-skills`
- `/guides/docs-mcp`

## Route by Task

| User intent | Use skill |
| --- | --- |
| Manage Wacht resources (users, orgs, workspaces), call the Machine API, apply config, scaffold | `wacht-bench-cli` |
| Add Wacht to a project, detect framework, choose packages | `wacht-setup` |
| Next.js App Router, middleware/proxy, server actions, route handlers | `wacht-nextjs-patterns` |
| React Router loaders/actions, SSR, route guards | `wacht-react-router-patterns` |
| TanStack Router route guards, server functions, route context | `wacht-tanstack-router-patterns` |
| Node, Bun, Deno, Hono, Workers, serverless backend auth | `wacht-backend-js` |
| B2B SaaS, orgs, workspaces, roles, tenancy | `wacht-orgs-workspaces` |
| Customer API keys, OAuth clients, gateway authorization | `wacht-api-auth` |
| Webhook apps, receiver verification, replay, idempotency | `wacht-webhooks` |
| Notification inbox, unread count, realtime stream | `wacht-notifications` |
| Wacht agents, tools, MCP servers, approvals, hooks, skill bundles | `wacht-agents` |
| Playwright/Cypress/backend tests for Wacht flows | `wacht-testing` |
| Creating or improving Wacht skills | `wacht-skill-authoring` |

## Working Standard

- Prefer the project's existing framework and file layout.
- Do not invent Wacht APIs from memory.
- Cite the Wacht docs pages used when explaining important choices.
- Run the validation commands from the specialized skill before finishing.

## Source of Truth for Customer-Facing Code

When the code you write will be read or run by a customer (their app, their `.env`, demo material, hand-off snippets, blog/launch content), the **skill text and Wacht Docs MCP are the source of truth**. Source-code grep is for internal/contributor work only.

Why this matters: the SDK source exports advanced/internal knobs as normal-looking public options. Reading the source and pattern-matching "public option = customer env var" leaks plumbing into customer DX. The skills and docs are the curated public surface — anything not mentioned there should stay out of customer-facing files (`.env.example`, README, integration code).

If a knob is missing from the skill but you think a customer needs it, that is a signal to ask the user — not a signal to invent the env var.

## Cross-Skill Safety Rules

| Risk | Rule |
| --- | --- |
| Secret leakage | Never put `WACHT_API_KEY` or backend keys in client code or public env names. |
| Client-only auth | Client auth state is UX only; protected reads and mutations need server enforcement. |
| Tenant leakage | Organization/workspace scoped features must enforce tenancy server-side. |
| Stale docs | Use Wacht Docs MCP or local checked-in docs before relying on remembered SDK behavior. |
| Source-grep bias | For customer-facing code, skills + Docs MCP only. Do not grep `wacht/node/src`, `wacht/react/src`, etc. as a primary reference. |
| Over-editing | Make the smallest integration change that satisfies the user request. |
