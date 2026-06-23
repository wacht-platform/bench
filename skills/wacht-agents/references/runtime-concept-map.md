# Agent Runtime Concept Map

Use this reference before changing agent execution behavior, runtime UI, or agent configuration.

## Main Surfaces

Runtime objects form an `actor → project → (board items + threads)` tree. The agent record is referenced by the project but never owns task content directly.

| Surface | Responsibility |
| --- | --- |
| Actor | "As whom" the agent acts. `subject_type` + `external_key` identify a Wacht user or service identity. |
| Agent definition | Model, tools, knowledge bases, approvals, hooks, and skill bundle configuration. No task prompt — agents are reusable executors. |
| Actor project | A unit of work pairing an actor with an agent. Holds a board (planned tasks) and threads (runtime streams). |
| Board item (task) | The task definition: `title`, `description` (the prompt the agent runs), `schedule_kind` (lowercase `"once"` / `"interval"`), `next_run_at` (RFC3339 UTC, required for both kinds), `interval_seconds`, optional file `mounts`. |
| Conversation/thread | User-visible work stream and persisted messages/events. Auto-created when a scheduled board item fires; user-created via `createAgentThread` for ad-hoc work. |
| Execution run | One concrete agent run inside a thread, with tool calls, approvals, status, and output. |
| Tool catalog | Internal, API, CodeRunner, PlatformEvent, MCP, and Virtual (third-party via Composio) tools. |
| Skill bundle | Read-only procedural knowledge mounted for the active agent. |
| Session ticket | Single-use token that gates the vanity console URL for an agent or user. Used to share a chat link. |

## Runtime Flow

1. A board item fires (manually or on its schedule) or an actor opens a thread directly.
2. Agent configuration is loaded from the project's agent.
3. System and agent-local skills are mounted; board item `mounts` (if any) are attached to the thread filesystem.
4. Execution start hooks run.
5. Agent loop reads the board item `description` (or thread message) and plans tool calls.
6. Approval policy decides allow/review/deny for each tool call.
7. Tool results and events are appended to runtime history.
8. Execution end hooks run on success, failure, abort, or budget cap.
9. For `INTERVAL` board items, the next run is queued at `now + interval_seconds`.

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
