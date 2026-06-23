---
name: wacht-notifications
description: Use when implementing Wacht notification inboxes, notification hooks, unread state, realtime streams, backend sending patterns, or actionable notification UX.
---

# Wacht Notifications

Use this skill for in-app notifications and realtime notification handling.

## Activation Rules

Use when the task mentions notification inboxes, unread counts, notification streams, mark-as-read, actionable notifications, backend notification sending, or realtime notification UX.

Do not use for outgoing webhook event delivery unless the task is specifically about in-app notifications generated from webhooks.

## Grounding

Use Wacht Docs MCP to read current notification guides, SDK hooks, components, and backend sending patterns before coding.

Required docs:

- `/guides/notifications`
- `/guides/notifications/backend-sending-patterns`
- `/guides/notifications/frontend-inbox-with-hooks`
- `/guides/notifications/realtime-stream-handling`
- `/guides/notifications/actionable-notification-ux`

## Quick Reference

| Task | Pattern |
| --- | --- |
| Inbox UI | Notification hooks/components |
| Unread badge | unread count hook/state |
| Realtime updates | stream hook with reconnect handling |
| Backend send | backend SDK/API method |
| Action button | server-authorized mutation |
| Mark read | optimistic UI plus server update |

## Workflow

1. Decide whether the work is sender-side, receiver-side, realtime stream handling, or UI.
2. Use Wacht notification hooks and components when building frontend UI.
3. Keep unread count, pagination, and mark-as-read behavior consistent.
4. Handle reconnects and duplicate events in realtime streams.
5. Use backend methods for sending or managing notification records.
6. Keep actionable notification buttons server-authorized.

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Unread count drifts | Stream and pagination states are separate | Reconcile count after mark-read and stream events. |
| Duplicate notifications | Reconnect replays events | Deduplicate by notification/event ID. |
| Action button lets wrong user act | Client-only action check | Reauthorize action server-side. |
| Inbox flashes empty during load | Missing loading/initialized state | Render loading separately from empty state. |

## Validation

Run typecheck and UI/backend tests. Cover empty inbox, unread count, mark read, realtime arrival, reconnect, and action authorization.
