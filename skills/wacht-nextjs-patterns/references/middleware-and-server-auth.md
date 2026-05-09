# Middleware and Server Auth

Use this when changing Wacht route protection, request auth, or server helpers in Next.js.

## File Name Decision

| Next.js version | File |
| --- | --- |
| Next.js 16+ | `proxy.ts` |
| Next.js 15 or older | `middleware.ts` |

The implementation code stays the same.

## Request Auth Flow

1. Browser sends session cookie, dev session query, bearer token, or auth cookie.
2. `wachtMiddleware()` normalizes the request into an auth object.
3. Middleware serializes auth into `x-wacht-auth`.
4. Server helpers read the serialized auth state.

Do not expect `auth(await headers())` to do the full handshake by itself. It relies on middleware.

## Route Policy Strategy

Use public-first policy unless the app is mostly private:

```ts
const isProtected = createRouteMatcher([
  '/dashboard(.*)',
  '/account(.*)',
  '/settings(.*)',
]);
```

Then protect only matching routes:

```ts
if (!isProtected(req)) return NextResponse.next();
await auth.protect();
return NextResponse.next();
```

## API Route Behavior

Browser routes and API routes need different failure behavior. Configure:

```ts
{ apiRoutePrefixes: ['/api', '/trpc'] }
```

This lets browser pages redirect and API routes return proper `401` or `403` responses.

## Permission Checks

Use `auth.protect()` for scoped permission checks:

```ts
await auth.protect({
  permission: 'workspace:members:read',
  workspaceId,
});
```

Use the active auth object's `organizationId`, `workspaceId`, and permission lists instead of trusting client-submitted tenancy identifiers.
