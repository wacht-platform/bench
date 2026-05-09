# Server Actions and API Routes

Use this when protected work happens in a Next.js route handler or server action.

## Route Handler Pattern

```ts
import { requireAuth } from '@wacht/nextjs/server';

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  const body = await request.json();

  await auth.protect({
    permission: 'workspace:items:write',
    workspaceId: body.workspaceId,
  });

  return Response.json({ ok: true });
}
```

## Optional Auth Pattern

```ts
import { getAuth } from '@wacht/nextjs/server';

export async function GET(request: Request) {
  const auth = await getAuth(request);

  if (!auth.isAuthenticated) {
    return Response.json({ viewer: null });
  }

  return Response.json({ viewer: { userId: auth.userId } });
}
```

## Server Component Pattern

```tsx
import { headers } from 'next/headers';
import { NavigateToSignIn } from '@wacht/nextjs';
import { auth } from '@wacht/nextjs/server';

export default async function AccountPage() {
  const wacht = auth(await headers());

  if (!wacht.isAuthenticated || !wacht.userId) {
    return <NavigateToSignIn />;
  }

  return <div>{wacht.userId}</div>;
}
```

## Backend Client Pattern

Use the server entrypoint:

```ts
import { wachtClient } from '@wacht/nextjs/server';

export async function GET() {
  const client = await wachtClient();
  return Response.json({ ok: true });
}
```

Keep privileged clients in server-only files. Never import them into client components.
