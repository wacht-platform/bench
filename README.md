# Wacht Bench

Wacht Bench is the AI development CLI for building with Wacht.

The Wacht skills package is installed separately with the open Skills CLI, and Bench helps configure those skills, Wacht Docs MCP, prompts, and future scaffolding.

## Install Skills

Install the full Wacht skill pack:

```bash
npx skills add wacht-platform/bench
```

Install one skill:

```bash
npx skills add wacht-platform/bench --skill wacht-nextjs-patterns
```

Install from a local checkout:

```bash
npx skills add ./bench
```

## Use the CLI

Run without installing:

```bash
npx @wacht/bench init
npx @wacht/bench login
```

After installing globally or as a project tool, use the `wacht` command:

```bash
wacht init
wacht login
wacht deployments current
wacht deployments select
wacht projects list
wacht projects create --name "My App" --method email
wacht deployments create staging --project <project_id> --method email
wacht deployments create staging --project <project_id> --method email --method github_oauth
wacht config pull
wacht config diff
wacht config apply --dry-run
wacht mcp config --client cursor
wacht doctor
```

`wacht init` detects Next.js, React Router, and TanStack Router projects, then writes AI-ready Wacht context. It does not wire framework code, patch app files, or edit package dependencies. Bench prepares the project/deployment context and starter templates so an AI assistant can use the installed skills, Docs MCP, and OpenAPI discovery to make the correct app-specific edits.

Generated bootstrap files can include:

```text
.wacht/bench.json
.wacht/BOOTSTRAP.md
.env.wacht.example
AGENTS.md
.wacht/templates/**/*
```

Starter templates can include provider, middleware/protected-request, and contract wrapper files. They are intentionally written under `.wacht/templates` only and are not imported by the app.

Supported project and staging auth methods are `email`, `phone`, `username`, `google_oauth`, `apple_oauth`, `facebook_oauth`, `github_oauth`, `discord_oauth`, `linkedin_oauth`, `gitlab_oauth`, and `x_oauth`. Production creation follows the console flow and accepts `email`, `phone`, and `username`; social providers can be configured after deployment creation.

Commands are interactive by default when run in a real terminal. Use explicit flags for automation:

```bash
wacht --json auth status
wacht --json projects list
wacht --no-interactive projects create --name "My App" --method email
wacht --no-interactive deployments create staging --project <project_id> --method email
```

Generic Machine API calls support JSON, URL-encoded forms, multipart text fields, and multipart files:

```bash
wacht api GET /projects
wacht api POST /project --form name="My App" --form methods=email
wacht api POST /upload --form purpose=avatar --file image=./avatar.png
wacht api POST /upload --form image=@./avatar.png
```

OpenAPI discovery is available for backend operations:

```bash
wacht api schema refresh
wacht api ls --search users
wacht api describe createUser
wacht api call getActiveUserList --param limit=10
wacht api call createUser --form email_address=person@example.com
wacht api call getActiveUserList --deployment <deployment_id> --param limit=10
```

The OpenAPI schema is cached at `~/.wacht/platform-api.openapi.json` for 24 hours. Use `--refresh` on `api ls`, `api describe`, or `api call` when you need the latest schema immediately.

Deployment settings can be managed as config:

```bash
wacht config pull
wacht config schema > wacht.config.schema.json
wacht config diff --file wacht.config.json
wacht config apply --file wacht.config.json --dry-run
wacht config apply --file wacht.config.json --yes
```

Production applies require an explicit deployment confirmation:

```bash
wacht config apply --file wacht.config.json --production --confirm <deployment_id> --yes
```

Config pull uses the active deployment selected by `wacht deployments select`. It writes editable auth, display, B2B, and restriction settings. Secrets and provider credentials are not written to config files.

For agents, prefer `--json` and pass every input with flags. For humans, `wacht api` can prompt for method, path, body type, fields, and files.

The CLI is a convenience wrapper. The source of truth for installable agent skills is the `wacht-platform/bench` repository.

## Bench Auth

Bench uses Wacht's first-party public OAuth client with Authorization Code + PKCE. No client secret is shipped in the CLI.

```text
Client ID: oc_SCoNL5oNiIiELWFhknqQsUvQ9FDrfMBC
Redirect URI: http://127.0.0.1:37819/callback
Scopes: read write
OAuth issuer: https://m2ma.wacht.dev
Machine API: https://machine.wacht.dev
```

Tokens are stored locally at `~/.wacht/bench-auth.json`.

## What Bench Includes

- Agent skills for Wacht app development across Next.js, React Router, TanStack Router, Backend JS, API Auth, webhooks, notifications, agents, testing, B2B tenancy, and skill authoring.
- Prompts for common Wacht implementation flows.
- MCP setup snippets for `https://wacht.dev/docs/mcp`.
- Validation scripts for the skill pack.

## Recommended Assistant Instruction

```text
Use Wacht skills for Wacht implementation work.
Before coding, use the Wacht Docs MCP server at https://wacht.dev/docs/mcp for current Wacht SDK, API, and guide details.
Run the validation commands named by the active skill before finishing.
```

## Repository Layout

```text
skills/                 Installable agent skills
prompts/                Reusable prompts for common Wacht work
packages/bench-cli/     @wacht/bench CLI package
scripts/                Repo validation scripts
```
