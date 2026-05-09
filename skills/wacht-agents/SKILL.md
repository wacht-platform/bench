---
name: wacht-agents
description: Use when building Wacht agents, tools, MCP server integrations, model overrides, approval policies, execution hooks, or agent-local skill bundles.
---

# Wacht Agents

Use this skill for Wacht's AI agent runtime and agent configuration surfaces.

## Activation Rules

Use when the task mentions Wacht agents, tools, MCP servers, agent approvals, execution hooks, model overrides, knowledge bases, agent-local skill bundles, or agent runtime UI.

Do not use for general AI coding assistant configuration unless it is part of Wacht's agent runtime or Wacht skills.

## Grounding

Use Wacht Docs MCP to read current agent guides, model overrides, hooks, approval policy, MCP server, and skill bundle docs before coding.

Required docs:

- `/guides/agents`
- `/guides/agents/model-overrides`
- `/guides/agents/hooks`
- `/guides/agents/approval-policy`
- `/sdks/rust/ai-runtime`

## Quick Reference

| Task | Pattern |
| --- | --- |
| Change model per agent | model override |
| Run setup/cleanup around executions | execution hooks |
| Risky tools need review | approval policy |
| External tool server | MCP server + actor connection |
| Agent-specific procedural knowledge | agent-local skill bundle |
| Tool call auditability | execution/tool event logs |

Read `references/runtime-concept-map.md` before changing agent execution behavior, approvals, hooks, MCP tools, or skill bundle logic.

## Workflow

1. Identify whether the work affects agent definitions, tools, MCP connections, approvals, hooks, skills, or runtime UI.
2. Use approval policies for risky tool execution instead of ad hoc checks.
3. Use execution hooks only for short deterministic setup or cleanup.
4. Use MCP server connection flows for user-authorized external tools.
5. Keep agent-local skills concise and specific to the agent's repeated work.
6. Preserve auditability for tool calls, approvals, and execution outcomes.

## Approval Policy Guidance

Use approval policies for:

- write operations in external systems
- email/message sending
- deployment or destructive tools
- payment/billing actions
- tools that expose sensitive data

Prefer regex or namespace-level policy over hand-checking each invocation.

## Hook Guidance

Hooks should be:

- short
- deterministic
- safe to retry
- non-judgmental

Do not put branching reasoning or long-running work into hooks. Put that into the agent instructions or a tool.

## References

- `references/runtime-concept-map.md`
- `references/approvals-hooks-and-mcp.md`

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Agent cannot call MCP tool | Actor not connected or tool name mismatch | Check MCP server connection and `mcp_{server_slug}_{tool}` name. |
| Approval never triggers | Policy pattern misses tool name | Match actual tool namespace/name. |
| Hook failure breaks expectation | Hook does too much | Keep hooks short and tolerate failure. |
| Skill bundle not used | Skill metadata too vague | Make `description` specific and task-triggered. |

## Validation

Run relevant frontend/backend checks. Test tool availability, approval required path, approval denied path, MCP disconnected path, and successful agent execution.
