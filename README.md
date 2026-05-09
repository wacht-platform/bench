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

```bash
pnpm dlx @wacht/bench init
wacht-bench mcp config --client cursor
wacht-bench doctor
```

The CLI is a convenience wrapper. The source of truth for installable agent skills is the `wacht-platform/bench` repository.

## What Bench Includes

- Agent skills for Wacht app development across Next.js, React Router, TanStack Router, React SPA, Backend JS, Rust/Axum, API Auth, webhooks, notifications, agents, testing, B2B tenancy, and skill authoring.
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
