---
name: wacht-bench-cli
description: Use whenever a Wacht task needs to read or change Wacht state — projects, deployments, users, organizations, workspaces, deployment config, or arbitrary Machine API operations — through the `wacht` CLI instead of writing one-off code.
---

# Wacht Bench CLI

Use this skill any time a Wacht task asks the agent to *do something* against the platform — list, inspect, create, or change Wacht resources — instead of *write code that calls* the platform. The Bench CLI (`wacht`, published as `@wacht/bench`) is the canonical typed surface for that work and is already wired up by `wacht init`.

## Activation Rules

Activate when the user asks to:

- log in or check Bench auth (`wacht login`, `wacht auth status`)
- create or switch projects/deployments
- list, inspect, or create users / organizations / workspaces
- pull, diff, or apply deployment settings as code
- call any Wacht Machine API operation (e.g. impersonation tokens, webhook apps, API auth apps, AI runtime resources)
- print MCP config for an editor (`wacht mcp config --client cursor`)
- bootstrap a brand-new Wacht-ready project (`wacht init --starter <framework>`)

Do **not** activate to wire app code — that's `wacht-setup` and the framework-specific skills. The CLI is for working *against* a deployment, not inside an app.

## Grounding

Before running anything that reads or changes data, use Wacht Docs MCP for current command shapes and the Machine API surface.

Required docs:

- `/guides/wacht-bench`
- `/guides/bench-skills`
- `/guides/docs-mcp`

## Quick Reference

| User intent | CLI command |
| --- | --- |
| Sign in / check session | `wacht login` · `wacht auth status` · `wacht logout` |
| Pick the active deployment | `wacht deployments select` · `wacht deployments current` · `wacht deployments clear` |
| List or create projects | `wacht projects list` · `wacht projects create --name "App" --method email` |
| Create a deployment | `wacht deployments create staging --project <id> --method email` |
| Bootstrap a new project | `wacht init --starter nextjs` (or `react-router`, `tanstack`) |
| Add Wacht to current project | `wacht init` |
| Print MCP config for an editor | `wacht mcp config --client cursor` (or `claude`, `codex`) |
| List users in a deployment | `wacht users list --search "@acme.com"` |
| Inspect a user | `wacht users get <user_id>` |
| Create a user | `wacht users create --field email_address=person@example.com` |
| List orgs | `wacht orgs list` |
| Get an org | `wacht orgs get <organization_id>` |
| Create an org | `wacht orgs create --field name="Acme"` |
| List workspaces | `wacht workspaces list --org <organization_id>` |
| Create a workspace | `wacht workspaces create --org <organization_id> --field name="Production"` |
| Pull deployment config | `wacht config pull --file wacht.config.json` |
| Diff config vs deployment | `wacht config diff --file wacht.config.json` |
| Dry-run / apply config | `wacht config apply --file wacht.config.json --dry-run` · `--yes` |
| Apply to production | `wacht config apply --file wacht.config.json --production --confirm <deployment_id> --yes` |
| Discover an API operation | `wacht api ls --search <text>` · `wacht api describe <operationId>` |
| Call any Machine API | `wacht api call <operationId> --param k=v --field k=v` |
| Generic raw request | `wacht api GET /projects` · `wacht api POST /project --form name=…` |
| Shell completion | `wacht completion bash` (or `zsh`, `fish`, `powershell`) |

## Working Standard

1. **Prefer first-class commands** over `wacht api call` when both exist. Reach for `wacht users list` before constructing the equivalent OpenAPI call manually.
2. **Always confirm the active deployment** with `wacht deployments current` (or pass `--deployment <id>`) before any read or write that's deployment-scoped — avoid silently acting against the wrong environment.
3. **Use `--json` and `--no-interactive`** when running inside an agent context. Both are non-prompting and machine-parseable. Never rely on the prompts.
4. **Production writes need explicit confirmation.** `wacht config apply --production` requires `--confirm <deployment_id>` *and* `--yes`. Don't bypass either flag.
5. **Discover before you call.** When asked to do something Bench doesn't have a first-class command for, run `wacht api ls --search <topic>` then `wacht api describe <operationId>` *before* `wacht api call`. Cite the operation id in your response.
6. **Refresh the schema** with `wacht api ls --refresh` (or `wacht api schema refresh`) when the user hits a "missing operation" error or after a known platform-API release.
7. **Don't write secrets.** `wacht config pull` deliberately omits credentials and provider secrets. Never echo or commit a real `WACHT_API_KEY`, OAuth client secret, or webhook signing key.

## Common Recipes

### Sign in and pick a deployment

```bash
wacht login
wacht deployments select
wacht deployments current
```

### Create a new project + staging deployment

```bash
wacht projects create --name "Acme" --method email --method google_oauth
# `--no-select` if you don't want it active immediately
```

### Promote settings from staging to production

```bash
wacht config pull --file wacht.config.json
# stage commits this file
wacht config diff --file wacht.config.json --deployment <prod_deployment_id>
wacht config apply --file wacht.config.json \
  --deployment <prod_deployment_id> \
  --production --confirm <prod_deployment_id> --yes
```

### Find and call an undocumented Machine API operation

```bash
wacht api ls --search webhooks
wacht api describe getWebhookApps
wacht api call getWebhookApps --param limit=20 --json
```

## Validation

Before reporting a CLI-driven task complete:

- Run the command with `--json` and confirm `ok: true` (or the documented success shape) in the response.
- For config changes: re-run `wacht config diff` and confirm there are no remaining drift items.
- For resource creates: re-run the matching `list` or `get` command and show the new id.
