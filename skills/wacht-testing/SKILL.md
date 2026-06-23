---
name: wacht-testing
description: Use when writing or fixing tests for Wacht auth, tenancy, API auth, webhooks, notifications, backend SDKs, or agent workflows.
---

# Wacht Testing

Use this skill for test work around Wacht integrations.

## Activation Rules

Use when writing, fixing, reviewing, or designing tests for Wacht auth, tenancy, API Auth, webhooks, notifications, backend SDK clients, agents, or migration safety.

Do not use for unrelated unit tests unless Wacht behavior is involved.

## Grounding

Use Wacht Docs MCP to confirm the current SDK behavior, API contracts, and expected flows before writing tests.

Required docs:

- `/guides/integration-playbooks/fullstack-auth-lifecycle-react-rust`
- `/guides/api-auth`
- `/guides/webhook-apps`
- `/guides/agents/approval-policy`

## Decision Tree

| Area | Required scenarios |
| --- | --- |
| Page auth | signed out redirect/deny, signed in allow |
| API auth | missing token, invalid token, valid token, missing permission |
| Tenancy | tenant A cannot access tenant B, workspace belongs to org |
| API Auth | invalid key, valid key, revoked key, missing scope/permission |
| Webhooks | valid signature, invalid signature, duplicate event, replay |
| Notifications | empty state, unread count, mark read, realtime arrival |
| Agents | approval required, approval denied, MCP disconnected, success path |

## Workflow

1. Identify the risk: auth boundary, tenant isolation, API contract, webhook verification, realtime behavior, or agent workflow.
2. Prefer the repo's existing test framework and fixtures.
3. Test both denied and allowed paths.
4. Include tenant isolation for organization or workspace-scoped features.
5. Mock Wacht only at stable boundaries. Prefer real SDK helpers when the repo already uses them in tests.
6. Keep secrets and publishable keys separated in fixtures.

## Playwright Pattern

Use existing app login helpers if present. If creating new helpers, separate:

- unauthenticated browser context
- authenticated user context
- authenticated user in organization A
- authenticated user in organization B

Never reuse authenticated storage state across tenants unless the test explicitly validates tenant switching.

## Backend Test Pattern

Create request helpers for:

- no credential
- invalid credential
- valid user session
- valid API key or OAuth access token
- valid credential with missing permission

Keep authorization fixtures explicit so failures are readable.

## Minimum Scenarios

- Signed out or missing token is denied.
- Invalid token or key is denied.
- Valid user or principal succeeds.
- Insufficient role or permission is denied.
- Cross-tenant access is denied.

## References

- `references/auth-test-matrix.md`
- `references/webhook-test-matrix.md`

## Validation

Run the narrow affected tests first, then the repo's standard typecheck or test command.
