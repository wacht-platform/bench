---
name: wacht-nextjs-patterns
description: Use when implementing Wacht auth, route protection, server auth, or account UI in a Next.js application.
---

# Wacht Next.js Patterns

Use this skill for Next.js App Router or Pages Router projects that integrate Wacht.

## Activation Rules

Use when the project has `next` installed or the task mentions Next.js, App Router, Pages Router, Server Components, route handlers, Server Actions, middleware, or `proxy.ts`.

Do not use for React Router, TanStack Router, or plain Vite SPA projects.

## Grounding

Use Wacht Docs MCP to read the current Next.js quickstart, middleware or proxy guidance, client auth docs, and server-side auth docs before editing.

Required docs:

- `/sdks/nextjs/quickstart`
- `/sdks/nextjs/middleware`
- `/sdks/nextjs/server-side`
- `/sdks/nextjs/client-side-auth`

## Quick Reference

| Task | Pattern | File |
| --- | --- | --- |
| Mount client auth | `DeploymentProvider` + `DeploymentInitialized` | `app/layout.tsx` |
| Protect browser routes | `wachtMiddleware()` + `createRouteMatcher()` | `proxy.ts` or `middleware.ts` |
| Protect API routes | `requireAuth(request)` or `auth.protect()` | `app/api/**/route.ts` |
| Read auth in Server Component | `auth(await headers())` | Server Component |
| Branch on optional auth | `getAuth(request)` | Route handler |
| Call platform API from server route | `import { ai, users, … } from '@wacht/backend'` — the default client lazy-inits from `WACHT_API_KEY`. No `wachtClient()` plumbing needed. | `app/api/**/route.ts` |
| Override SDK client config | `import { initClient } from '@wacht/backend'` once (e.g. for non-default base URL or custom fetch) | server-only module |

## Mental Model

Wacht has three separate layers in Next.js:

1. Middleware normalizes request auth and serializes it into `x-wacht-auth`.
2. Server helpers read that normalized auth in route handlers and server components.
3. Client components render auth-aware UX but do not secure protected mutations.

Read `references/middleware-and-server-auth.md` for the detailed flow.

## Workflow

1. Find the root layout and confirm `DeploymentProvider` is mounted once.
2. Use the project's Next.js version to choose `proxy.ts` or `middleware.ts`.
3. Protect route groups with `wachtMiddleware()` and route matchers.
4. Use `SignedIn`, `SignedOut`, `UserButton`, and navigation helpers for client UI.
5. Use server helpers such as `getAuth()` or `requireAuth()` before protected data reads or mutations.
6. Keep `WACHT_API_KEY` server-only and `NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY` client-safe.

## Minimal Patterns

### Root Provider

```tsx
import { DeploymentInitialized, DeploymentProvider } from '@wacht/nextjs';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DeploymentProvider publicKey={process.env.NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY!}>
          <DeploymentInitialized>{children}</DeploymentInitialized>
        </DeploymentProvider>
      </body>
    </html>
  );
}
```

### Route Protection

```ts
import { NextResponse } from 'next/server';
import { createRouteMatcher, wachtMiddleware } from '@wacht/nextjs/server';

const isProtected = createRouteMatcher(['/account(.*)', '/dashboard(.*)']);

export default wachtMiddleware(
  async (auth, req) => {
    if (!isProtected(req)) return NextResponse.next();
    await auth.protect();
    return NextResponse.next();
  },
  { apiRoutePrefixes: ['/api', '/trpc'] },
);

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

### API Route Enforcement

```ts
import { requireAuth } from '@wacht/nextjs/server';

export async function POST(request: Request) {
  const auth = await requireAuth(request);

  return Response.json({
    userId: auth.userId,
    organizationId: auth.organizationId,
    workspaceId: auth.workspaceId,
  });
}
```

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| `auth(await headers())` is empty in Server Component | Middleware did not run | Add `wachtMiddleware()` and correct matcher. |
| API route redirects instead of returning JSON | Missing API prefix config | Pass `apiRoutePrefixes: ['/api', '/trpc']`. |
| Mutation works when signed out | Server Action or route handler lacks auth check | Call `requireAuth()` or `auth.protect()` at the start. |
| Secret key appears in client bundle | Server key imported in client component | Move backend client to server-only module. |
| Duplicate auth loading/network calls | Provider mounted in nested layout or page | Mount provider once at the root. |

## References

- `references/middleware-and-server-auth.md`
- `references/server-actions-and-api-routes.md`

## Validation

Run the project's typecheck. If present, run route/auth tests covering:

- signed-out protected page access
- signed-out protected API access
- signed-in protected page access
- signed-in protected mutation
- insufficient permission or tenant mismatch
