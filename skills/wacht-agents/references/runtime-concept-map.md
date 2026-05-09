# Agent Runtime Concept Map

Use this reference before changing agent execution behavior, runtime UI, or agent configuration.

## Main Surfaces

| Surface | Responsibility |
| --- | --- |
| Agent definition | Model, tools, knowledge bases, approvals, hooks, and skill bundle configuration. |
| Conversation/thread | User-visible work stream and persisted messages/events. |
| Execution run | One concrete agent run with tool calls, approvals, status, and output. |
| Task/board item | Work planning and assignment surface for longer-running agents. |
| Tool catalog | Internal tools, API tools, code runner tools, platform events, MCP tools, and virtual tools. |
| Skill bundle | Read-only procedural knowledge mounted for the active agent. |

## Runtime Flow

1. Actor starts or resumes a thread/task.
2. Agent configuration is loaded.
3. System and agent-local skills are mounted.
4. Execution start hooks run.
5. Agent loop plans and emits tool calls.
6. Approval policy decides allow/review/deny for each tool call.
7. Tool results and events are appended to runtime history.
8. Execution end hooks run on success, failure, abort, or budget cap.

## Thread and Review Boundaries

- Conversation threads are for user-visible interaction.
- Execution runs are for concrete attempts and auditability.
- Review/approval state should be tied to the tool call or execution run, not hidden in prompt text.
- Long-running work should preserve enough event history to explain what the agent did and why it stopped.

## Skill Bundle Rules

- Skill metadata must be specific enough to trigger only for the intended work.
- `SKILL.md` should hold workflow guidance, not full product docs.
- Larger examples belong in `references/`.
- Agents should use Wacht Docs MCP for current Wacht facts.
