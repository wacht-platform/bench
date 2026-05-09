# Webhook Operations and Replay

Use this reference for support, observability, and replay workflows.

## Operator Screens Should Show

- endpoint URL and status
- subscribed event names
- signing secret rotation state
- recent deliveries
- response status and latency
- error message summary
- retry and replay actions

## Replay Safety

Replay is only safe when receivers are idempotent.

Before adding replay:

1. Confirm receiver uses event/delivery idempotency.
2. Confirm duplicate side effects are impossible or compensated.
3. Confirm customer-facing docs explain replay semantics.

## Alerting

Alert on sustained endpoint failure, not a single failed attempt. Group by endpoint and event type where possible.
