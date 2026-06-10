# Server health (manual smoke)

Server-reachability is host-owned (`src/bun/serverHealth.ts`): one recovery loop,
broadcast to every window. The cross-window behavior isn't unit-tested (Electrobun
runtime), so verify by hand:

1. `bun run app:dev`. Open a second native window (expand an issue, or ⌘,).
2. Drop GitLab (disconnect VPN / stop the instance). Trigger a request in either
   window (navigate/refresh).
3. **Both** windows show the banner with the **same** countdown, ticking in
   lockstep (e.g. both "retrying in 5s"). Before this change they drifted.
4. Click **Retry now** in one window → both banners flip to "retrying…" together.
5. Restore GitLab. On the next probe (or a Retry now), **both** banners clear and
   **each** window refetches its data.
6. Token test: revoke/replace the token so requests 401. After one confirm probe,
   **all** windows show the re-connect overlay. Re-enter a valid token → all clear.
