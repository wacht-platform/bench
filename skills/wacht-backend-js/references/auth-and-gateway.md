# Backend Auth and Gateway

Use this reference when choosing between user-session auth and machine credential authorization.

## User Session Routes

Use request auth helpers:

```ts
import { authenticateRequest } from '@wacht/backend';

export async function handler(request: Request) {
  const auth = await authenticateRequest(request);
  await auth.protect({ permission: 'workspace:read' });
  return Response.json({ userId: auth.userId });
}
```

Use this for routes called by signed-in browser users.

## Gateway-Protected Machine Routes

Use gateway authorization for API keys, OAuth access tokens, or machine tokens. Do not force these through session auth.

```ts
import { gateway } from '@wacht/backend';

const result = await gateway.checkPrincipalAuthz({
  principalType: 'api_key',
  principalValue: credential,
  method: request.method,
  resource: new URL(request.url).pathname,
});
```

After gateway authorization, use the resolved principal context to scope data access.

## Error Policy

| Condition | Status |
| --- | --- |
| Missing credential | 401 |
| Invalid credential | 401 |
| Valid credential, missing permission | 403 |
| Valid credential, wrong tenant | 403 |
| Malformed request body | 400 |

Preserve the application's existing error response shape.
