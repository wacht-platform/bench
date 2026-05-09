# Tenant Safety

Use this reference whenever Wacht org/workspace state affects data access.

## Server-Side Tenant Check

Every protected read or mutation should answer:

1. Who is the user or principal?
2. Which organization or workspace is active?
3. Does the actor belong to that tenant?
4. Does the actor have the required role or permission?
5. Does the target resource belong to that same tenant?

## Query Rules

- Include `organizationId` or `workspaceId` in data queries for tenant-owned resources.
- Do not fetch by resource ID alone when IDs are guessable or externally visible.
- Do not trust tenant IDs from forms without comparing them to auth context.
- Validate active workspace belongs to active organization.

## UI States

Handle:

- no organizations
- no active organization
- organization selected but no workspaces
- pending invitations
- insufficient role
- tenant switch loading state
