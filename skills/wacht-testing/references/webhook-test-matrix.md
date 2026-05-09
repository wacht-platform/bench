# Webhook Test Matrix

Use this matrix for Wacht webhook receivers and webhook management features.

## Receiver Tests

| Case | Expected |
| --- | --- |
| Valid signature and new event | accepted and processed/enqueued |
| Invalid signature | rejected |
| Missing signature | rejected |
| Malformed JSON with valid signature | 400 |
| Duplicate event | no duplicate side effect |
| Downstream failure before enqueue | retryable failure |
| Durable enqueue success | 2xx |

## Replay Tests

- Replayed event uses the same idempotency path.
- Replayed already-processed event does not duplicate side effects.
- Failed replay records the error in delivery observability.

## Management UI Tests

- Endpoint create.
- Endpoint test.
- Endpoint delete.
- Secret rotation.
- Subscription update.
- Delivery detail view.
- Replay action authorized by role.
