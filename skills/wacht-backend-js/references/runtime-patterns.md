# Runtime Patterns

Use this reference when adapting `@wacht/backend` to a server runtime.

## Node.js Services

- Initialize a client once during service startup when env is process-wide.
- Keep the API key in server-only env.
- Use request auth middleware for user routes.
- Use gateway checks for machine routes.

## Serverless Functions

- Avoid mutable global request state.
- Reuse client construction only if the platform safely reuses isolates.
- Read secrets from the platform's env/bindings.
- Keep responses explicit: 401 for auth, 403 for permission.

## Edge Workers

- Do not assume `process.env`.
- Pass `publishableKey`, API URL, and API key from bindings.
- Make auth helpers accept `Request` and standard Web APIs.

## Hono/Express/Fastify

- Put auth in middleware when many routes share the same policy.
- Use route-local checks for resource-specific permissions.
- Store normalized auth in the framework's request context only after verification.
