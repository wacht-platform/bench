# Webhook Receiver Patterns

Use this reference when implementing the application endpoint that receives Wacht webhook events.

## Receiver Order

1. Read raw request body.
2. Verify signature using configured secret.
3. Parse JSON only after verification.
4. Check idempotency store for event or delivery ID.
5. Persist or enqueue the event.
6. Return 2xx only after durable acceptance.

## Idempotency

Use a durable store keyed by event ID or delivery ID.

Store:

- event/delivery ID
- received timestamp
- processing status
- last error
- downstream resource affected

Replay must hit the same idempotency path as normal delivery.

## Response Policy

| Condition | Response |
| --- | --- |
| Invalid signature | 401 or 400 |
| Malformed JSON after verification | 400 |
| Duplicate already processed event | 200 |
| Durable enqueue succeeded | 200 or 202 |
| Temporary downstream failure before enqueue | 5xx |
