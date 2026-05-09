---
name: wacht-rust-axum
description: Use when implementing Wacht Rust SDK clients, Axum auth middleware, extractors, permission checks, or gateway authorization in Rust services.
---

# Wacht Rust Axum

Use this skill for Rust services that integrate Wacht, especially Axum services.

## Activation Rules

Use when the repo has `Cargo.toml` and the task mentions Wacht Rust SDK, Axum middleware, extractors, gateway authorization, permissions, or Rust service auth.

Do not use for JavaScript backend services.

## Grounding

Use Wacht Docs MCP to read the current Rust SDK getting started docs and Axum framework guides before coding.

Required docs:

- `/sdks/rust/getting-started`
- `/sdks/rust/frameworks/axum`
- `/sdks/rust/frameworks/axum/auth-layer-setup`
- `/sdks/rust/frameworks/axum/extractors-and-permissions`
- `/sdks/rust/frameworks/axum/gateway-authorization`

## Quick Reference

| Task | Pattern |
| --- | --- |
| SDK client | `WachtClient::from_env().await?` or existing explicit config |
| Axum route auth | `AuthLayer` or Wacht extractor pattern |
| Required user | `RequireAuth` extractor or equivalent |
| Permission check | Auth context permission helper/check |
| API key/OAuth route | Gateway authorization helpers |
| Build check | `cargo check` for affected crate |

## Workflow

1. Inspect `Cargo.toml` for the `wacht` crate and enabled features.
2. Use `WachtClient::from_env()` or the project's existing explicit config path.
3. Add Axum auth layers or extractors at the narrowest route scope needed.
4. Enforce permissions before protected data access or mutation.
5. Use gateway authorization helpers for API key or OAuth protected routes.
6. Preserve the service's existing error and tracing style.

## Minimal Patterns

```rust
use wacht::{Result, WachtClient};

#[tokio::main]
async fn main() -> Result<()> {
    let client = WachtClient::from_env().await?;
    let users = client.users().list_users().send().await?;
    println!("fetched {} users", users.len());
    Ok(())
}
```

Axum feature: fetch `/sdks/rust/getting-started` through Wacht Docs MCP, copy the current crate version, and enable the `axum` feature. Do not leave placeholder versions in committed TOML.

## Common Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Axum types unavailable | Missing `axum` feature | Enable `features = ["axum"]`. |
| Auth works but permission ignored | Extractor only checks identity | Add permission/resource check before mutation. |
| Gateway route rejects valid API key | Session auth used for machine route | Use gateway authorization helper. |
| Compile errors from async client init | Client setup placed in sync context | Initialize async at startup or inject state. |

## Validation

Run `cargo check` for the affected crate. Run relevant Rust tests when auth, routing, or gateway behavior changes.
