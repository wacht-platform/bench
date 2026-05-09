# API Auth Prompt

```text
Use Wacht skills and Wacht Docs MCP.

Goal:
Implement customer-managed API keys for this product.

Required behavior:
- Use the `wacht-api-auth` skill.
- Decide whether this feature should use vanity pages or custom UI, and state the reason.
- Add or identify the backend API Auth app provisioning path.
- Add a trusted backend endpoint for short-lived API Auth management tickets.
- Enforce tenant membership and permission before issuing a ticket.
- Add gateway authorization checks for incoming API-key protected requests if the task includes a resource server.
- Add tests for missing key, invalid key, valid key, revoked key, missing permission, and tenant isolation.

Before coding:
- Fetch current API Auth docs and backend SDK/API reference through Wacht Docs MCP.
```
