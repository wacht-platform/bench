# Wacht Bench

Wacht is an identity, B2B, API auth, webhooks, and agent-runtime layer for SaaS. This repo is the developer toolkit you use when building on it: a bundle of 15 agent skills plus the `wacht` CLI for working against your Wacht deployments from the terminal.

If you're using an AI coding assistant (Claude Code, Cursor, Windsurf, Codex, etc.), install the skills. They tell your assistant which patterns to use, where to find current docs, and which CLI command to reach for. That avoids the usual "the API for that endpoint has changed and the LLM is giving you stale snippets" problem.

## Install

The whole skill pack:

```bash
npx skills add wacht-platform/bench
```

One skill at a time:

```bash
npx skills add wacht-platform/bench --skill wacht-nextjs-patterns
```

The CLI is separate. Install globally with whatever package manager you use:

```bash
npm i -g @wacht/bench
wacht --version
```

Or run it without installing:

```bash
npx @wacht/bench init
```

## What's in the pack

15 skills, each scoped to a specific concern so your assistant only loads what's relevant.

**Routing**

- `wacht`. The entry-point skill. Start here. It picks the right specialist for any Wacht task.

**Setup + CLI**

- `wacht-setup`. Bootstrapping Wacht in a new or existing app. Framework detection, SDK package selection, first working sign-in flow.
- `wacht-bench-cli`. Using the `wacht` CLI to read or change Wacht state. Users, orgs, workspaces, deployments, raw Machine API calls.

**Framework integrations**

- `wacht-nextjs-patterns`. Providers, middleware, route protection, account UI in Next.js.
- `wacht-react-router-patterns`. Same for React Router. Loaders, actions, server auth.
- `wacht-tanstack-router-patterns`. Same for TanStack Router. `beforeLoad`, server functions, route guards.
- `wacht-backend-js`. Server-side Node, Bun, Cloudflare Workers, Hono. Token verification, gateway authorization.
- `wacht-rust-axum`. Rust + Axum. Middleware, extractors, gateway checks.

**Product surfaces**

- `wacht-orgs-workspaces`. B2B tenancy. Organizations, workspaces, memberships, role checks.
- `wacht-api-auth`. API keys, OAuth apps, machine credentials. Hosted and custom API auth flows.
- `wacht-webhooks`. Webhook endpoints. Signatures, replay, idempotency.
- `wacht-notifications`. Notification inboxes, realtime streams, backend sending.
- `wacht-agents`. Agent runtime. Tools, MCP, model overrides, approval policies, execution hooks.

**Testing + authoring**

- `wacht-testing`. Test patterns across auth, tenancy, agents.
- `wacht-skill-authoring`. For contributors. How to add or modify skills in this pack.

## What `wacht` does

It's the convenience wrapper for the things you'd otherwise click through the Wacht console for.

Quickstart:

```bash
wacht login                            # OAuth via browser
wacht deployments select               # pick the deployment you're working against
wacht users list --search "@acme.com"
wacht users create --field email_address=person@example.com
wacht orgs list
wacht workspaces list --org <org_id>
```

Bring Wacht up in a fresh project:

```bash
wacht init                             # adds AGENTS.md block + .env.wacht.example
wacht init --starter nextjs            # clones a working starter and bootstraps it
```

Wire the Docs MCP server into your AI client:

```bash
wacht mcp install                      # interactive picker, auto-detects installed clients
wacht mcp install --client cursor-user,codex --yes
wacht mcp list
```

Drive the Machine API directly. Any endpoint, no SDK glue code needed:

```bash
wacht api ls --search users
wacht api describe createUser
wacht api call createUser --field email_address=person@example.com
```

Manage deployment settings as code:

```bash
wacht config pull
wacht config diff
wacht config apply --yes
```

Full command list with `wacht --help` or at https://wacht.dev/docs/guides/wacht-bench.

## What `wacht init` writes

A short context block for your AI assistant. No app code, no package edits, no patched layouts.

- `.env.wacht.example`. The env vars your SDK actually reads. Framework-aware (`NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY` for Next.js, `VITE_WACHT_PUBLISHABLE_KEY` for Vite-based stacks), plus `WACHT_API_KEY`.
- `AGENTS.md`. Appends a Wacht block with a routing table that points your assistant at the right skill, the Docs MCP URL, and the right CLI command for each task. Creates the file if it doesn't exist yet.

That's it. Your assistant then has enough context to do the actual app integration without guessing.

## The Docs MCP server

`https://wacht.dev/docs/mcp` serves the current SDK reference, API surface, and guide content as MCP tool calls. Your assistant reaches for it before writing Wacht code, so it always works against current info instead of stale snippets from training data.

`wacht mcp install` wires it into any of these clients with one command, automatically detecting what's installed on your machine:

- Claude Desktop
- Claude Code (user + project scope)
- Cursor (user + project scope)
- VS Code (user + project scope)
- Windsurf
- Codex CLI

`wacht mcp list` shows what's detected. `wacht mcp uninstall` reverses an install.

## Auth

The CLI uses Wacht's own OAuth public client with PKCE. No client secret bundled. Tokens land in `~/.wacht/bench-auth.json`.

```text
OAuth issuer: https://m2ma.wacht.dev
Machine API:  https://machine.wacht.dev
Client ID:    oc_SCoNL5oNiIiELWFhknqQsUvQ9FDrfMBC
Redirect:     http://127.0.0.1:37819/callback
```

## Recommended AGENTS.md / system prompt

If you don't run `wacht init`, drop this into your project's `AGENTS.md` or your assistant's system prompt:

```text
Use Wacht skills for Wacht implementation work. Start with the `wacht` skill.
Before writing Wacht code, consult Wacht Docs MCP at https://wacht.dev/docs/mcp.
Use the `wacht` CLI for anything that reads or changes Wacht state.
```

## Agent loop hygiene

If you're running these inside an agent loop (Claude Code, Cursor agent mode, etc.), the CLI behaves predictably:

- Pass `--json` to get machine-readable output for every command that supports it.
- Pass `--no-interactive` to disable prompts (the CLI will fail loudly instead of hanging on stdin).
- Production config applies require `--production --confirm <deployment_id> --yes`. Triple lock on purpose.

## Repo layout

```text
skills/                 The 15 installable skills
prompts/                Reusable prompts for common flows
packages/bench-cli/     Source for @wacht/bench
scripts/                Repo validation
```

## Validating the skill pack

Useful if you fork this or write your own:

```bash
node scripts/validate-skills.mjs
```

Checks frontmatter, doc references, and naming conventions across every skill.

## License

Apache-2.0.
