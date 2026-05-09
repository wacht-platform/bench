# Gateway Authorization

Use this reference for customer API endpoints protected by API keys or OAuth access tokens.

## Policy Shape

Gateway checks should consider:

- credential type
- HTTP method
- requested resource path
- required permissions or scopes
- resolved principal tenant context

## Route Pattern

1. Extract credential from `Authorization` or configured header.
2. Reject missing credential with `401`.
3. Run gateway authorization.
4. Reject invalid credential with `401`.
5. Reject valid credential with missing scope/permission using `403`.
6. Use resolved principal context to scope data.

## Tenant Safety

Never accept tenant IDs only from request body or query parameters. Compare requested tenant/resource scope with the authorized principal context returned by Wacht.
