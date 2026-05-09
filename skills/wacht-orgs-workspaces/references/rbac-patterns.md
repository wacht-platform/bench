# RBAC Patterns

Use this reference for role and permission checks.

## UI and Server Split

UI checks improve experience. Server checks enforce security.

Use UI checks for:

- hiding controls
- showing upgrade/request-access states
- explaining missing permissions

Use server checks for:

- every protected mutation
- every tenant-scoped read
- invitation management
- role assignment
- API key/webhook management

## Permission Failure Policy

| Condition | Status |
| --- | --- |
| Not signed in | 401 |
| Signed in but not tenant member | 403 |
| Tenant member but missing role/permission | 403 |
| Tenant exists but resource does not belong to tenant | 404 or 403, following app policy |

Prefer not revealing resource existence across tenants.
