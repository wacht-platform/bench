# Approvals, Hooks, and MCP

Use this reference when changing approval policy, hook behavior, or MCP tool integration.

## Approval Policy Resolution

Approval policy should be treated as a tool-call decision layer:

1. Deny rules block the call.
2. Review rules pause for human approval.
3. Allow rules let the call run unattended.
4. MCP namespace toggles apply to tools named `mcp_{server_slug}_{tool}`.
5. Regex overrides should match the actual emitted tool name, not a display label.

When behavior is unclear, inspect current docs and source before coding.

## MCP Tool Naming

MCP tools live in the agent's flat tool namespace:

```text
mcp_{server_slug}_{tool}
```

Examples:

```text
mcp_linear_create_issue
mcp_slack_post_message
```

If an MCP tool is missing:

- confirm the MCP server exists
- confirm actor connection/consent is complete
- confirm the slug in the tool name
- confirm the tool catalog was refreshed

## Execution Hooks

Hooks are configured as:

- `execution_start`
- `execution_end`

Each hook step names a tool and passes a JSON object as `args`.

Hooks should be:

- short
- deterministic
- safe to retry
- observable through emitted events

Do not put branching reasoning or long-running work in hooks. Put that in the agent's instructions or a dedicated tool.
