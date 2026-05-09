# Next.js Auth Prompt

```text
Use Wacht skills and Wacht Docs MCP.

Goal:
Bootstrap Wacht auth in this Next.js app end to end.

Required behavior:
- Install the correct Wacht packages using this repo's package manager.
- Mount the Wacht provider once in the root layout.
- Add route protection for `/account(.*)` and `/dashboard(.*)`.
- Add server-side auth enforcement to protected API routes or server actions touched by the change.
- Keep `WACHT_API_KEY` server-only and `NEXT_PUBLIC_WACHT_PUBLISHABLE_KEY` client-safe.
- Run typecheck and the narrowest relevant tests.

Before coding:
- Use the `wacht-nextjs-patterns` skill.
- Fetch current Wacht docs through Wacht Docs MCP.
```
