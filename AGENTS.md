# Wacht Bench Agent Guide

This repository packages Wacht skills, prompts, and the `@wacht/bench` CLI.

## Rules

- Keep each skill concise. Do not copy full Wacht documentation into skills.
- Every skill should tell agents to use Wacht Docs MCP for current Wacht facts.
- Put installable skills in `skills/<skill-name>/SKILL.md`.
- Keep skill names lowercase hyphen-case and match the directory name.
- Run validation after editing skills:

```bash
node scripts/validate-skills.mjs
```

## Product Names

- Skills package: `wacht-platform/bench`
- CLI product: Wacht Bench
- NPM package: `@wacht/bench`
- CLI binary: `wacht-bench`
- MCP endpoint: `https://wacht.dev/docs/mcp`
