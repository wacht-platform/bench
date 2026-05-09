# API Auth Management Flow

Use this reference for customer-facing API key and OAuth client management.

## Trust Boundary

1. User signs in to your app.
2. Backend validates the user, tenant, and RBAC policy.
3. Backend issues a short-lived `api_auth_access` ticket.
4. Frontend exchanges the ticket.
5. Frontend opens vanity UI or custom management hooks.

The backend remains the authority for who may manage API credentials.

## App Slug Convention

Use a stable slug and keep it tenant-safe:

```text
aa_<deploymentId>
```

If the product has one API Auth app per organization or workspace, include that scope in the slug convention and document it.

## Go-Live Checklist

- API Auth app exists in staging and production.
- Ticket issuance endpoint enforces RBAC.
- Ticket expiry is short.
- Key create, rotate, revoke flows are tested.
- Audit logs are visible to support or security owners.
- Customer docs explain secure key handling.
