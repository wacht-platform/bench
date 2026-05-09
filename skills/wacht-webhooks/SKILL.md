---
name: wacht-webhooks
description: Use when implementing Wacht webhook endpoints, event subscriptions, signature verification, delivery replay, idempotency, or webhook observability.
---

# Wacht Webhooks

Use this skill for event delivery, webhook apps, subscriptions, endpoint management, and receiver code.

## Activation Rules

Use when the task mentions webhook apps, endpoint subscriptions, delivery attempts, replay, receiver verification, event catalogs, deployment events, or syncing Wacht events into another system.

Do not use for browser notifications unless events are delivered through webhook apps.

## Grounding

Use Wacht Docs MCP to read current webhook app guides, deployment event docs, backend SDK docs, and API reference before coding.

Required docs:

- `/guides/webhook-apps/overview`
- `/guides/webhook-apps/vanity-pages-implementation`
- `/guides/webhook-apps/custom-hook-flow-implementation`
- `/guides/webhook-apps/deliveries-replay-and-observability`
- `/guides/deployment-events/use-webhooks-to-keep-backend-in-sync`

## Mental Model

Webhooks have a control plane and a data plane:

- Control plane: endpoint CRUD, subscriptions, secrets, tests, replay controls.
- Data plane: event emission, delivery attempts, retries, receiver status, metrics.

Keep these separate when designing code and tests.

## Quick Reference

| Task | Pattern |
| --- | --- |
| Customer manages endpoints | Webhook app + ticketed vanity/custom UX |
| Receive Wacht events | Raw body signature verification first |
| Avoid duplicate side effects | Idempotency key from event or delivery ID |
| Handle slow downstream work | Verify, persist/enqueue, then return success |
| Replay failed delivery | Re-run with idempotent receiver |
| Operate failures | Delivery logs, error message, retry/replay status |

## Workflow

1. Identify producer and consumer sides: Wacht endpoint setup, receiving application, or operator UI.
2. Verify signatures before trusting payloads.
3. Make receivers idempotent using event IDs or delivery IDs.
4. Return success only after durable processing or durable enqueue.
5. Implement replay flows without duplicating side effects.
6. Include delivery status, error messages, and timestamps where building observability.

## Minimal Provisioning Pattern

```ts
import { WachtClient } from '@wacht/backend';

const client = new WachtClient({ apiKey: process.env.WACHT_API_KEY! });

await client.webhooks.createWebhookApp({
  name: 'Billing Webhooks',
  app_slug: 'wh_42',
  description: 'Webhook app for deployment 42',
});
```

## References

- `references/receiver-patterns.md`
- `references/operations-and-replay.md`

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Forged event accepted | Signature not verified | Verify raw body before trusting JSON. |
| Replay creates duplicates | Receiver has no idempotency | Store processed event/delivery IDs. |
| Wacht retries forever | Receiver returns failure after durable enqueue | Return success once event is durably accepted. |
| Customer cannot debug failures | No delivery observability | Show status, timestamps, response code, error body summary. |

## Validation

Run tests for valid signature, invalid signature, duplicate event, retry, replay, and receiver failure.
