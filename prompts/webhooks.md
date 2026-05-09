# Webhooks Prompt

```text
Use Wacht skills and Wacht Docs MCP.

Goal:
Implement a production-ready Wacht webhook flow.

Required behavior:
- Use the `wacht-webhooks` skill.
- Identify whether this task is webhook app management, receiver implementation, replay/observability, or all of them.
- Verify receiver signatures before trusting payloads.
- Add idempotency using event or delivery IDs.
- Return success only after durable processing or durable enqueue.
- Add replay behavior that cannot duplicate side effects.
- Add tests for valid signature, invalid signature, duplicate event, replay, retry, and receiver failure.

Before coding:
- Fetch current webhook app, delivery/replay, deployment event, and backend SDK docs through Wacht Docs MCP.
```
