# Example Wacht Skill

Use this as a compact template for a new skill in `wacht/skills`.

```md
---
name: wacht-example-domain
description: Use when implementing Wacht Example Domain flows, including setup, server enforcement, UI wiring, and validation for Example Domain features.
---

# Wacht Example Domain

Use this skill when the task touches Example Domain behavior in a Wacht app.

## Activation Rules

Use when the user mentions Example Domain, Example Domain routes, Example Domain permissions, or migration from hand-written Example Domain code to Wacht SDK helpers.

Do not use for unrelated Wacht setup or general auth work.

## Grounding

Use Wacht Docs MCP before coding. Fetch the relevant pages when implementation details, package names, or examples matter.

Required docs:

- `/guides/docs-mcp`
- `/sdks/js/backend`
- `/sdks/js/nextjs`

## Workflow

1. Inspect the app framework and existing Wacht integration.
2. Read the Required docs through Wacht Docs MCP before writing framework-specific code.
3. Prefer existing project helpers over introducing a second Wacht client or provider.
4. Add server-side enforcement before client UI changes.
5. Keep examples free of pinned Wacht package versions unless the user explicitly asks for a pinned version.

## Validation

- Run the repo's typecheck for affected TypeScript code.
- Run focused route, permission, or integration tests when behavior changes.
- Confirm server secrets are not imported into client modules.
```

Checklist before adding a skill:

- Directory name and `name` are identical lowercase hyphen-case.
- `description` says when the skill should activate, not just what it is about.
- `Required docs:` lists at least two real Wacht docs paths.
- `Wacht Docs MCP` is named explicitly.
- Any `references/...` path mentioned in `SKILL.md` exists.
- Examples avoid stale package versions and unverifiable API claims.
