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
- `/guides/agents/multi-agent`
- `/guides/agents/model-overrides`
- `/guides/agents/hooks`
- `/guides/agents/approval-policy`
- `/guides/tasks`
- `/guides/tasks/workspace-and-artifacts`
- `/guides/tasks/deliverables`
- `/guides/tasks/file-uploads`
- `/guides/tasks/realtime-ui`
- `/sdks/rust/ai-runtime`

## Quick Reference

| Task | Pattern |
| --- | --- |
| Change model per agent | model override |
| Run setup/cleanup around executions | execution hooks |
| Risky tools need review | approval policy |
| External tool server | MCP server + actor connection |
| Third-party app (Reddit, Gmail, …) as a tool | Composio toolkit enabled on the deployment; tools auto-surface at runtime |
| Agent-specific procedural knowledge | agent-local skill bundle |
| Recurring or scheduled agent work | project task board item with `schedule_kind` |
| Share an agent chat URL with a teammate or end user | backend session ticket + vanity URL |
| Tool call auditability | execution/tool event logs |
| Multi-stage work with different models per stage | coordinator agent + specialist executor lanes with `capability_tags` |
| User uploads a file with a task | multipart `createProjectTaskBoardItemWithAttachments` (Node) / `create_board_item_with_attachments` (Rust) |
| User attaches a file to a comment | multipart on the comment endpoint; agent reads it at `/task/uploads/...` |
| Surface task output to your UI | read `board_item.deliverables[]` — structured `{result_summary, artifacts, findings, cautions, next}` per completion |
| Agent needs to ask the user something free-form | `ask_user`; user answers with `freeform_text` (or structured `answers`) |
| Agent writes files for the user to download | write to `/task/artifacts/` from inside the agent sandbox; surface via deliverables |

Read `references/runtime-concept-map.md` before changing agent execution behavior, approvals, hooks, MCP tools, or skill bundle logic.

## Object Hierarchy

Wacht agents live inside an `actor → project → (board items + threads)` tree. The agent record is the *executor*; per-run instructions and scheduling live on board items.

| Object | Created by | Role |
| --- | --- | --- |
| Actor | `createActor` (`subject_type`, `external_key`) | The "as whom" the agent runs — typically a Wacht user or a service identity. |
| Agent | `createAiAgent` | Reusable executor: model overrides, tools, knowledge bases, hooks, approval rules. No task-level prompt — the agent itself has no `instructions` field. |
| Actor project | `createActorProjectFlat` (`actor_id` query param, body `agent_id` + `name`) | A unit of work the agent owns; carries a board of tasks and a stream of threads. |
| Board item (task) | `createProjectTaskBoardItem` | The actual task: `title`, `description` (the prompt), `schedule_kind`, `next_run_at`, `interval_seconds`, and optional `mounts`. |
| Thread | `createAgentThread` / runtime-created on schedule | The execution stream: messages, tool calls, approvals, filesystem. |

Schedule kinds (from `models::project_task_schedule::schedule_kind`) — wire values are **lowercase**. The platform `.trim()`s but does not case-fold, so `"ONCE"` / `"INTERVAL"` are rejected with a 400.

- `"once"` — runs once at `next_run_at`, then stops.
- `"interval"` — runs every `interval_seconds`, first fire anchored at `next_run_at`.

`next_run_at` is **required for both kinds**: a UTC RFC3339 timestamp (e.g. `"2026-01-15T18:00:00Z"`). `interval_seconds` (a number) is required for `"interval"`. Omitting `next_run_at` also 400s.

## Recurring Task Recipe

```
# 1. Actor for the workflow (skip if you already have one)
wacht api call createActor --body @actor.json

# 2. Agent (executor)
wacht api call createAiAgent --body @agent.json

# 3. Project that pairs the actor + agent
wacht api call createActorProjectFlat --param actor_id=<id> --body @project.json

# 4. Board item carries the task prompt + schedule
wacht api call createProjectTaskBoardItem \
  --param project_id=<id> \
  --body @board-item.json
```

`board-item.json`:

```json
{
  "title": "…",
  "description": "…the prompt the agent runs against…",
  "schedule_kind": "interval",
  "next_run_at": "2026-01-15T18:00:00Z",
  "interval_seconds": 21600
}
```

The runtime picks up the board item, opens a thread on its schedule, and runs the agent against the description. For one-shot scheduled work use `"schedule_kind": "once"` with a `next_run_at` and no `interval_seconds`.

## Task Workspace, Artifacts, Deliverables

Every board item gets a private `/task/` filesystem inside the agent sandbox:

- `/task/artifacts/` — files the executor writes as deliverables. Validated to exist when a task completes.
- `/task/uploads/` — files uploaded with the task (at create time, on update, or via a comment).
- `/task/JOURNAL.md` — auto-appended structured handoff entries, one per completion.

When the coordinator marks a task `completed`, the runtime appends an entry to `board_item.deliverables[]`. Each entry has `at`, `assignment_id`, `by_agent_name`, `result_summary`, `artifacts[]`, plus optional `findings`, `cautions`, `next`. Render this in your UI; don't render the journal — it's the agent's memory, not the user's view.

To read deliverables from the frontend: `useProjectTaskBoardItem(projectId, taskId)`. The `item.deliverables` array updates live as completions land.

## File Uploads

Three multipart endpoints accept `attachments` (form field):

- `POST /ai/actor-projects/{project_id}/board/items` — files at task creation
- `POST /ai/actor-projects/{project_id}/board/items/{item_id}/update` — files added later
- `POST /ai/actor-projects/{project_id}/board/items/{item_id}/comments` — files on a user comment

Files land in S3 under the task workspace, surfaced to the agent at `/task/uploads/<id>_<safe-name>`. Attachment metadata is merged into `metadata.attachments`. Per-file cap: 64 MB.

Node SDK methods: `createProjectTaskBoardItemWithAttachments`, `updateProjectTaskBoardItemWithAttachments`, `createProjectTaskBoardItemCommentWithAttachments`. Rust SDK: `client.ai().actor_projects().create_board_item_with_attachments(...)` and siblings. The JSON-only methods stay backward compatible.

There is no client-writable filesystem endpoint. Agents write to `/task/`; clients read only.

## Multi-Agent Orchestration

Use when stages need different models, tools, or prompts. The pattern: one coordinator agent + N specialist agents, each in its own thread, tagged with `capability_tags`. The coordinator decides which lane runs next based on board state and prior `deliverables`. Coordinators never call execution tools; executors never route. The status machine enforces this.

Don't reach for multi-agent if one agent can do the work — coordination overhead can cost more than just running a stronger model on a single agent.

Each lane reports back through the structured handoff (`findings`/`cautions`/`next`). The journal tail (last 60 lines) is auto-included in the coordinator's next prompt.

## ask_user and Pending Question

When an agent calls `ask_user`, the board item gets a `pending_question` and status flips to `needs_clarification`. Your UI renders the question; the user answers via `answerProjectTaskBoardItemQuestion` with one of:

- Structured `answers: [{question_id, value}]`
- Or `freeform_text: "..."` (up to 4000 chars; mutually exclusive with `answers`)

Both flow into `ConversationContent::ClarificationResponse` on the thread. The agent resumes on the next iteration with the user's reply in context.

## Sharing an Agent Session

The console's vanity agent UI is gated by a one-time session ticket.

```
wacht api call createBackendSessionTicket --body @ticket.json
# → { "ticket": "<ticket>", "expires_at": <epoch> }
```

`ticket.json`:

```json
{ "ticket_type": "agent_access", "agent_ids": ["<agent_id>"], "actor_id": "<actor_id>" }
```

The response includes a fully-formed `url` the redeemer can open directly — no host stitching required:

```json
{ "ticket": "…", "expires_at": 1730000000, "url": "https://<frontend_host>/vanity/agents?ticket=…" }
```

`/session/tickets` issues four ticket types. Each redirects to a different vanity surface (shown for reference — use `response.url`, don't reassemble):

| `ticket_type` | Vanity surface | Required fields |
| --- | --- | --- |
| `agent_access` | `/vanity/agents` | `agent_ids`, `actor_id` |
| `impersonation` | `/sign-in?ticket=…` | `user_id` |
| `api_auth_access` | `/vanity/api-auth` | `api_auth_app_slug` |
| `webhook_app_access` | `/vanity/webhook` | `webhook_app_slug` |

The same shape exists on the console router (`create_session_ticket`); bench-side code should use the backend variant (`createBackendSessionTicket`).

### Per-user actor + ticket from a server route

When a session is scoped to an authenticated end user, reuse an actor across visits — `external_key` is the natural anchor. Look up first, create if missing:

```ts
// app/api/agent-session/route.ts (Next.js)
import { requireAuth } from '@wacht/nextjs/server';
import { ai, sessions } from '@wacht/backend';

const AGENT_ID = process.env.AGENT_ID!;

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  const externalKey = auth.userId!;

  const { actor: existing } = await ai.lookupActor({
    subject_type: 'user',
    external_key: externalKey,
  });
  const actor =
    existing ??
    (await ai.createActor({
      subject_type: 'user',
      external_key: externalKey,
      display_name: externalKey,
    }));

  const { url, expires_at } = await sessions.createSessionTicket({
    ticket_type: 'agent_access',
    agent_ids: [AGENT_ID],
    actor_id: actor.id,
  });

  return Response.json({ url, expires_at });
}
```

The default `@wacht/backend` client lazy-inits from `WACHT_API_KEY` — no `wachtClient()` plumbing needed on standard Node / Next.js servers.

### `subject_type` conventions

`subject_type` namespaces `external_key`. The pair `(subject_type, external_key)` uniquely identifies an actor inside a deployment; the field is a free-form `string` with no platform-side enum. Pick a value and stay consistent:

| `subject_type` | When to use |
| --- | --- |
| `user` | Actor scoped to one end user. `external_key` is your user id. Most common. |
| `service` | Background job, scheduled scan, or any non-user identity. |
| `organization` | Actor that owns work on behalf of an organization. |
| `workspace` | Actor at workspace scope. |

Different `subject_type` values with the same `external_key` are distinct actors — don't switch the namespace mid-stream.

## Composio (Virtual Tools)

Composio toolkits (Reddit, Gmail, Slack, …) are enabled at the **deployment** level. Their tools surface to agents automatically at runtime — there is no `createAiTool` step for Virtual tools.

```
# 1. Enable the toolkit on the deployment (managed = Composio handles OAuth)
wacht api call enableComposioApp --body @enable.json

# 2. Confirm the toolkit's tools are available
wacht api call listComposioTools --param toolkits=<toolkit_slug>
```

`enable.json`:

```json
{
  "slug": "<toolkit_slug>",
  "auth": { "type": "managed", "auth_scheme": "OAUTH2" }
}
```

Do **not** call `createAiTool` with `tool_type: "Virtual"` — the platform rejects it with *"Virtual tools cannot be created directly — they are discovered at runtime"*.

Each actor that the agent acts on behalf of must authorize the toolkit before the agent can call its tools. The first failed call returns an OAuth handshake URL pointing the actor at the Composio auth flow.

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
