---
name: wacht-skill-authoring
description: Use when creating, editing, reviewing, validating, or publishing Wacht skills for the wacht-platform/bench package or a project-specific skill pack.
---

# Wacht Skill Authoring

Use this skill when the user asks to create or improve a Wacht skill, add a new skill to `wacht-platform/bench`, or make project-specific Wacht skills.

## Activation Rules

Use for skill authoring, skill reviews, skill publishing, and project-specific Wacht skill packs.

Do not use for normal Wacht app implementation unless the user is changing the skill pack itself.

## Grounding

Use Wacht Docs MCP before encoding Wacht-specific behavior into a skill. A skill should not become a stale copy of product documentation.

Required docs:

- `/guides/wacht-bench`
- `/guides/bench-skills`
- `/guides/docs-mcp`

## Skill Structure

Use this layout:

```text
skill-name/
  SKILL.md
  references/
    optional-detail.md
```

For a complete tiny skill that follows the pack conventions, read `references/example-skill.md`.

`SKILL.md` must include:

- YAML frontmatter with `name` and `description`
- Activation Rules
- Grounding
- Required docs
- Workflow or decision tree
- Validation

## Writing Rules

| Rule | Reason |
| --- | --- |
| Keep `SKILL.md` concise | It loads into model context when triggered. |
| Put long examples in `references/` | References are loaded only when needed. |
| Use specific trigger descriptions | Prevents accidental activation. |
| Name exact validation commands | Makes the skill operational. |
| Link to Wacht Docs MCP | Keeps Wacht facts current. |

## Required Docs Format

Every Wacht skill must include:

```md
Required docs:

- `/some/docs/path`
- `/another/docs/path`
```

Use paths that exist in Wacht Docs. Do not use generic placeholders.

## Validation

Run:

```bash
node scripts/validate-skills.mjs
```

## Publish Checklist

- Skill name matches directory name.
- Description clearly says when to use the skill.
- Required docs paths exist.
- `references/` links are not broken.
- Examples are copied from or verified against Wacht docs/source.
- No hardcoded package version is included unless it is intentionally pinned.
