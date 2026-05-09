# Auth Test Matrix

Use this matrix for Wacht auth and tenancy changes.

## User Session Routes

| Case | Expected |
| --- | --- |
| No credential | 401 or redirect |
| Invalid credential | 401 |
| Valid user, allowed route | success |
| Valid user, missing permission | 403 |
| Valid user, wrong organization | 403 or 404 |
| Valid user, wrong workspace | 403 or 404 |

## Browser Flows

- Signed-out user visits public page.
- Signed-out user visits protected page.
- Signed-in user visits protected page.
- Signed-in user switches organization.
- Signed-in user switches workspace.
- User signs out and protected page becomes inaccessible.

## API Auth Routes

| Case | Expected |
| --- | --- |
| Missing API key | 401 |
| Invalid API key | 401 |
| Revoked API key | 401 or 403 |
| Valid key, missing permission | 403 |
| Valid key, correct permission | success |
| Valid key, wrong tenant/resource | 403 |
