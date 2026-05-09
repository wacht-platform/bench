---
name: wacht-orgs-workspaces
description: Use when implementing Wacht B2B organizations, workspaces, memberships, role checks, tenancy state, or org and workspace switching.
---

# Wacht Organizations and Workspaces

Use this skill for B2B tenancy flows in Wacht applications.

## Activation Rules

Use when the task mentions B2B, organizations, workspaces, tenants, memberships, invitations, roles, permissions, org switching, workspace switching, SSO, verified domains, or tenant-scoped data.

Do not use for simple single-user auth unless org/workspace scope is part of the request.

## Grounding

Use Wacht Docs MCP to read current organization, workspace, B2B, SDK, and backend method docs before coding.

Required docs:

- `/product/b2b`
- `/sdks/rust/organizations-workspaces`
- SDK component/hook docs for organization and workspace controls
- backend API reference for organizations and workspaces

## Mental Model

Wacht tenancy has three related scopes:

1. User scope: the signed-in person.
2. Organization scope: the business/customer account.
3. Workspace scope: a narrower collaboration or resource boundary inside an organization.

Client-side active tenancy is UX state. Server-side authorization must enforce membership, role, permissions, and resource ownership.

## Quick Reference

| Task | Pattern |
| --- | --- |
| Show org switcher | SDK organization switcher/control component |
| Create org or workspace | SDK form/component or backend method with server authorization |
| Gate UI by role | Conditional UI plus server check |
| Protect data by tenant | Server uses auth tenancy context and resource ownership |
| Invite members | Backend or SDK membership/invitation flow |
| Custom role checks | `auth.protect()`/permission helper/server policy |

## Workflow

1. Identify whether the feature is user-scoped, organization-scoped, workspace-scoped, or deployment-scoped.
2. Use SDK hooks or backend methods that match the active tenancy scope.
3. Preserve active organization and active workspace selection rules.
4. Enforce membership and role checks server-side.
5. Avoid leaking data across organizations or workspaces.
6. Add UI states for no organization, no workspace, pending invitations, and insufficient permissions.

## Route and Data Patterns

Prefer URLs or resource identifiers that make tenancy explicit:

```text
/orgs/:orgSlug/settings
/workspaces/:workspaceId/projects
/api/orgs/:organizationId/members
```

Never rely only on client-submitted tenant IDs. Compare request scope with the Wacht auth context and database ownership.

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| User sees another tenant's data | Query not scoped by org/workspace | Add tenant scope to every read and mutation. |
| UI hides button but API still works | Client-only role check | Enforce permission server-side. |
| Wrong workspace after switching org | Workspace not reset or validated | Reconcile active workspace when organization changes. |
| Invited user cannot access expected tenant | Invitation accepted but active tenancy not updated | Refresh session/tenancy state after acceptance. |

## References

- `references/tenant-safety.md`
- `references/rbac-patterns.md`

## Validation

Run typecheck and tests. Cover at least two tenants and verify that data from one tenant cannot be read or mutated from another tenant context.
