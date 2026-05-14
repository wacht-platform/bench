# Framework Detection

Use this reference when `wacht-setup` needs to choose packages or route to a specialized skill.

## Package Signals

| Dependency | Meaning |
| --- | --- |
| `next` | Use `@wacht/nextjs`; inspect Next major version for `proxy.ts` vs `middleware.ts`. |
| `react-router` | Use `@wacht/react-router`; inspect loaders/actions and SSR mode. |
| `@tanstack/react-router` | Use `@wacht/tanstack-router`; inspect route tree and route context. |
| `@wacht/backend` already present | Preserve the existing server client pattern. |
| `wacht` Rust crate | Preserve the existing `WachtClient` setup and feature flags. |

## File Signals

| File or directory | Meaning |
| --- | --- |
| `app/layout.tsx` | Next.js App Router provider mount point. |
| `proxy.ts` | Next.js 16 request middleware entrypoint. |
| `middleware.ts` | Next.js 15 or older request middleware entrypoint. |
| `src/routes/*` with loaders/actions | React Router route-level data APIs. |
| `src/routeTree.gen.ts` or route tree setup | TanStack Router. |
| `Cargo.toml` with `axum` | Rust Axum service. |

## Package Manager Detection

Use the lockfile already present:

| Lockfile | Command style |
| --- | --- |
| `pnpm-lock.yaml` | `pnpm add ...` |
| `package-lock.json` | `npm install ...` |
| `yarn.lock` | `yarn add ...` |
| `bun.lockb` or `bun.lock` | `bun add ...` |

Do not switch package managers.

## Environment Names

Client-safe publishable key:

```bash
NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY=pk_test_xxx
```

Server-only API key:

```bash
WACHT_API_KEY=sk_live_xxx
```

Do not add `WACHT_BACKEND_API_URL` for normal setup. The backend SDK defaults to `https://api.wacht.dev`; deployment `backend_host`/`fapi.trywacht.xyz` is not the backend SDK API URL.

Never use a secret key in a public env variable.
