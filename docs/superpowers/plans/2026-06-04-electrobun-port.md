# Electrobun Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert lumen from a Vite-dev-server-as-runtime web app into an installable, cross-platform Electrobun desktop app whose Bun main process holds the GitLab token and proxies all GitLab traffic over typed RPC.

**Architecture:** Vite still builds the Vue/Tailwind SPA into `dist/`; Electrobun's `build.copy` maps `dist/` into the app bundle and serves it under the `views://` origin. The Bun main process (`src/bun/`) reads a token from an app-support config file and exposes RPC handlers (`gitlabGraphql`, `gitlabRest`, `gitlabAsset`, config CRUD) that the webview calls in place of the old `/gitlab` proxy. Images load as blob URLs fetched through RPC. A persisted vue-query cache gives instant-offline render.

**Tech Stack:** Electrobun (Bun main process + native webview), Vue 3, Vite, Tailwind v4, `graphql-request`, `@tanstack/vue-query` + `@tanstack/query-persist-client-core`, Vitest.

---

## Reference: pinned Electrobun API (verified against `blackboardsh/electrobun` `main`)

Bun side (`electrobun/bun`):
```typescript
import Electrobun, { BrowserWindow, BrowserView, ApplicationMenu } from "electrobun/bun";

const rpc = BrowserView.defineRPC<LumenRPC>({
  maxRequestTime: 30000,
  handlers: {
    requests: { /* name: async (args) => result */ },
    messages: {},
  },
});

const win = new BrowserWindow({
  title: "Lumen",
  url: "views://mainview/index.html",
  frame: { width: 1280, height: 860, x: 80, y: 80 },
  rpc,
});
```

View side (`electrobun/view`), bundled by Vite inside the Vue app:
```typescript
import Electrobun, { Electroview } from "electrobun/view";
const rpc = Electroview.defineRPC<any>({ maxRequestTime: 30000, handlers: { requests: {}, messages: {} } });
const electrobun = new Electrobun.Electroview({ rpc });
// call: (electrobun.rpc as any).request.gitlabGraphql({ query, variables })
```

Config (`electrobun.config.ts`): `app` (name/identifier/version), `build.bun.entrypoint`, `build.views.<name>.entrypoint`, `build.copy` (`"dist/index.html": "views/mainview/index.html"`, `"dist/assets": "views/mainview/assets"`), per-platform `build.mac`/`build.linux`/`build.win`. CLI: `electrobun dev`, `electrobun build`.

**Pragmatic typing note:** the view-side generic is loose in Electrobun's own examples (`<any>` + `rpc as any`). We keep our *app* code typed by funneling every call through one typed wrapper (`src/lib/rpc.ts`) that internally casts to `any`. Do not fight the framework generics.

---

## Shared RPC contract (referenced by many tasks)

This interface is the single source of truth for the RPC surface. It is created in Task 4 and imported by Bun handlers and the view wrapper.

```typescript
// src/lib/rpcContract.ts
export interface ConfigStatus { url: string | null; configured: boolean }
export interface GraphqlArgs { query: string; variables?: Record<string, unknown> }
export interface GraphqlResult { status: number; data?: unknown; errors?: { message: string }[] }
export interface RestArgs { method: 'GET' | 'POST'; path: string }
export interface RestResult { ok: boolean; status: number; statusText: string; body: string }
export interface AssetArgs { path: string }
export interface AssetResult { base64: string; contentType: string }
export interface SaveConfigArgs { url: string; token: string }

export interface LumenRequests {
  gitlabGraphql: (a: GraphqlArgs) => Promise<GraphqlResult>
  gitlabRest: (a: RestArgs) => Promise<RestResult>
  gitlabAsset: (a: AssetArgs) => Promise<AssetResult>
  getConfig: () => Promise<ConfigStatus>
  saveConfig: (a: SaveConfigArgs) => Promise<{ ok: true }>
  clearConfig: () => Promise<{ ok: true }>
}

export type LumenRPC = {
  maxRequestTime: number
  handlers: { requests: LumenRequests; messages: Record<string, never> }
}
```

---

## File structure

| Path | Responsibility | Task |
|---|---|---|
| `electrobun.config.ts` | App metadata, bundle, copy `dist/`→views, platforms | 1, 14 |
| `src/bun/index.ts` | Main process: window, menu, dev probe, RPC wiring | 1, 2, 6 |
| `src/bun/config.ts` | Read/write/first-run-import the app-support config | 3 |
| `src/bun/gitlab.ts` | Pure request builders + fetch handlers (token, TLS-off) | 5 |
| `src/mainview/index.ts` | Minimal Electrobun view entrypoint stub | 1 |
| `src/lib/rpcContract.ts` | Shared RPC types | 4 |
| `src/lib/rpc.ts` | View-side typed RPC wrapper (Electroview) | 6 |
| `src/gitlab/client.ts` | graphql-request client w/ RPC fetch shim | 7 |
| `src/gitlab/rest.ts` | REST helper over RPC | 8 |
| `src/composables/useGitlabAsset.ts` | path → blob URL via RPC, memoized | 9 |
| `src/lib/media.ts` | Pure DOM media-src resolver | 10 |
| `src/components/MarkdownText.vue` | Post-render media swap | 10 |
| `src/components/MediaViewer.vue` | Resolve viewer item srcs | 11 |
| `src/views/SettingsView.vue` | Onboarding / token entry | 12 |
| `src/router/index.ts` | Hash history + settings route + guard | 12 |
| `src/lib/persist.ts` | vue-query persister + buster | 13 |
| `src/main.ts` | Wire persisted query client | 13 |
| `vite.config.ts` | Drop proxy, `base: './'` | 1, 14 |

---

## Task 1: Scaffold Electrobun and open the Vite-built app in a native window

Walking skeleton — no GitLab, no RPC yet. Goal: `electrobun dev` opens a window showing the real Vue app.

**Files:**
- Create: `electrobun.config.ts`
- Create: `src/bun/index.ts`
- Create: `src/mainview/index.ts`
- Modify: `package.json` (scripts, dep)
- Modify: `vite.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Install Electrobun**

Run:
```bash
bun add electrobun
```
Expected: `electrobun` added to dependencies.

- [ ] **Step 2: Set Vite to emit relative asset paths**

The `views://` origin has no server root, so absolute `/assets/...` URLs 404. In `vite.config.ts`, add `base: './'` to the returned config object and **remove the entire `server.proxy` block** (the runtime no longer lives in Vite). Resulting return:

```typescript
return {
  base: './',
  plugins: [vue(), tailwindcss(), vueDevTools()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
};
```

Leave the `loadEnv`/`GITLAB_*` lines for now (Task 14 removes them).

- [ ] **Step 3: Create the minimal view entrypoint stub**

```typescript
// src/mainview/index.ts
// Electrobun requires a view entrypoint. The real UI is the Vite build copied
// over views/mainview/index.html; the RPC client is set up inside the Vue app
// (src/lib/rpc.ts). This stub exists only to satisfy the bundler.
export {}
```

- [ ] **Step 4: Create the Electrobun config**

```typescript
// electrobun.config.ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Lumen",
    identifier: "com.kdougan.lumen",
    version: "0.1.0",
  },
  build: {
    bun: { entrypoint: "src/bun/index.ts" },
    views: { mainview: { entrypoint: "src/mainview/index.ts" } },
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    mac: { bundleCEF: false },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
```

> If `ElectrobunConfig` is not exported from `electrobun`, drop the `import type` line and the `satisfies` clause; keep the object literal. Verify field names against `node_modules/electrobun` types and adjust if the installed version differs.

- [ ] **Step 5: Create the Bun main process**

```typescript
// src/bun/index.ts
import Electrobun, { BrowserWindow } from "electrobun/bun";

const win = new BrowserWindow({
  title: "Lumen",
  url: "views://mainview/index.html",
  frame: { width: 1280, height: 860, x: 80, y: 80 },
});

// Keep a reference so the window isn't collected.
void win;
void Electrobun;
```

- [ ] **Step 6: Add scripts and ignores**

In `package.json` `scripts`, add:
```json
"build": "vue-tsc --noEmit && vite build && electrobun build",
"app:dev": "vite build && electrobun dev"
```
(Keep the existing `dev`, `preview`, `codegen`, `typecheck`, `test`, `format`. The old `build` value `"vue-tsc --noEmit && vite build"` is replaced by the line above.)

In `.gitignore`, append:
```
/build
/dist
```

- [ ] **Step 7: Verify the window opens**

Run:
```bash
bun run app:dev
```
Expected: a native window titled "Lumen" opens showing the lumen UI (it will show a connection/error state since GitLab isn't wired yet — that's fine). Close it to end.

If the window is blank, open the webview devtools (right-click → Inspect, if available) and confirm assets load from `views://mainview/assets/...`. A 404 on assets means `base: './'` did not take — recheck Step 2.

- [ ] **Step 8: Commit**

```bash
git add electrobun.config.ts src/bun/index.ts src/mainview/index.ts package.json vite.config.ts .gitignore bun.lock
git commit -m "feat: scaffold Electrobun shell loading the Vite-built app"
```

---

## Task 2: Dev HMR — load the Vite dev server when it's running

**Files:**
- Modify: `src/bun/index.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Add a dev-server probe before window creation**

Replace the body of `src/bun/index.ts` with:

```typescript
// src/bun/index.ts
import Electrobun, { BrowserWindow } from "electrobun/bun";

const DEV_URL = "http://localhost:5173";

async function devServerUp(): Promise<boolean> {
  try {
    const res = await fetch(DEV_URL, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

const url = (await devServerUp()) ? `${DEV_URL}/index.html` : "views://mainview/index.html";

const win = new BrowserWindow({
  title: "Lumen",
  url,
  frame: { width: 1280, height: 860, x: 80, y: 80 },
});

void win;
void Electrobun;
```

- [ ] **Step 2: Add a concurrent HMR script**

In `package.json` `scripts`, add (uses Vite's own dev server on 5173, then launches Electrobun which probes it):
```json
"app:hmr": "vite & electrobun dev"
```

- [ ] **Step 3: Verify HMR mode**

Run:
```bash
bun run app:hmr
```
Expected: window opens loading from `localhost:5173`; editing a `.vue` file hot-updates the window without rebuild. Ctrl-C to stop both.

- [ ] **Step 4: Verify prod-copy mode still works**

Run:
```bash
bun run app:dev
```
Expected: window opens loading from `views://` (no Vite server running), UI renders.

- [ ] **Step 5: Commit**

```bash
git add src/bun/index.ts package.json
git commit -m "feat: load Vite dev server in the window when it is running"
```

---

## Task 3: App-support config (read / write / first-run .env import)

**Files:**
- Create: `src/bun/config.ts`
- Test: `src/bun/config.test.ts`

- [ ] **Step 1: Write failing tests for path resolution and round-trip**

```typescript
// src/bun/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, clearConfig } from "./config";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lumen-cfg-"));
  process.env.LUMEN_CONFIG_DIR = dir;
  delete process.env.GITLAB_URL;
  delete process.env.GITLAB_TOKEN;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.LUMEN_CONFIG_DIR;
});

describe("config", () => {
  it("reports unconfigured when no file and no env", () => {
    expect(loadConfig()).toEqual({ gitlabUrl: null, token: null });
  });

  it("imports from env on first run when no file exists", () => {
    process.env.GITLAB_URL = "https://gl.example.com/";
    process.env.GITLAB_TOKEN = "glpat-abc";
    // trailing slash trimmed
    expect(loadConfig()).toEqual({ gitlabUrl: "https://gl.example.com", token: "glpat-abc" });
  });

  it("round-trips saved config and prefers file over env", () => {
    process.env.GITLAB_URL = "https://env.example.com";
    process.env.GITLAB_TOKEN = "glpat-env";
    saveConfig({ url: "https://saved.example.com/", token: "glpat-saved" });
    expect(loadConfig()).toEqual({ gitlabUrl: "https://saved.example.com", token: "glpat-saved" });
  });

  it("clearConfig removes the saved file", () => {
    saveConfig({ url: "https://x.example.com", token: "t" });
    clearConfig();
    expect(loadConfig()).toEqual({ gitlabUrl: null, token: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/bun/config.test.ts`
Expected: FAIL — `loadConfig` is not defined.

- [ ] **Step 3: Implement config.ts**

```typescript
// src/bun/config.ts
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";

export interface AppConfig { gitlabUrl: string | null; token: string | null }

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/** Cross-platform per-user app data dir. Overridable via LUMEN_CONFIG_DIR (tests). */
export function configDir(): string {
  if (process.env.LUMEN_CONFIG_DIR) return process.env.LUMEN_CONFIG_DIR;
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Lumen");
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Lumen");
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "Lumen");
  }
}

const configPath = () => join(configDir(), "config.json");

export function loadConfig(): AppConfig {
  const path = configPath();
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<AppConfig>;
    return {
      gitlabUrl: raw.gitlabUrl ? trimSlash(raw.gitlabUrl) : null,
      token: raw.token ?? null,
    };
  }
  // First-run convenience: import from environment (.env in dev) if present.
  const envUrl = process.env.GITLAB_URL;
  const envToken = process.env.GITLAB_TOKEN;
  if (envUrl && envToken) return { gitlabUrl: trimSlash(envUrl), token: envToken };
  return { gitlabUrl: null, token: null };
}

export function saveConfig(input: { url: string; token: string }): void {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const data: AppConfig = { gitlabUrl: trimSlash(input.url), token: input.token };
  writeFileSync(configPath(), JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function clearConfig(): void {
  const path = configPath();
  if (existsSync(path)) rmSync(path);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/bun/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bun/config.ts src/bun/config.test.ts
git commit -m "feat: app-support config with first-run env import"
```

---

## Task 4: Shared RPC contract types

**Files:**
- Create: `src/lib/rpcContract.ts`

- [ ] **Step 1: Create the contract**

Create `src/lib/rpcContract.ts` with the exact content from the **Shared RPC contract** section near the top of this plan.

- [ ] **Step 2: Verify it typechecks**

Run: `bun run typecheck`
Expected: no new errors from `rpcContract.ts`. (Pre-existing codegen-related errors per `gitlab-codegen-workflow` memory are unrelated.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/rpcContract.ts
git commit -m "feat: shared RPC contract types"
```

---

## Task 5: GitLab request builders + Bun fetch handlers

Pure builders are unit-tested; the thin fetch handlers are exercised live in Task 6's manual verify.

**Files:**
- Create: `src/bun/gitlab.ts`
- Test: `src/bun/gitlab.test.ts`

- [ ] **Step 1: Write failing tests for the request builders**

```typescript
// src/bun/gitlab.test.ts
import { describe, it, expect } from "vitest";
import { buildGraphql, buildRest, buildAsset } from "./gitlab";

const cfg = { gitlabUrl: "https://gl.example.com", token: "glpat-xyz" };

describe("gitlab request builders", () => {
  it("builds a graphql POST with token + TLS-off", () => {
    const { url, init } = buildGraphql(cfg, { query: "{ x }", variables: { a: 1 } });
    expect(url).toBe("https://gl.example.com/api/graphql");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["PRIVATE-TOKEN"]).toBe("glpat-xyz");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ query: "{ x }", variables: { a: 1 } }));
    expect((init as { tls?: { rejectUnauthorized?: boolean } }).tls?.rejectUnauthorized).toBe(false);
  });

  it("builds a REST request against /api with token", () => {
    const { url, init } = buildRest(cfg, { method: "POST", path: "/v4/projects/1/star" });
    expect(url).toBe("https://gl.example.com/api/v4/projects/1/star");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["PRIVATE-TOKEN"]).toBe("glpat-xyz");
  });

  it("builds an asset request against /api with token", () => {
    const { url, init } = buildAsset(cfg, { path: "/v4/projects/1/uploads/abc/x.png" });
    expect(url).toBe("https://gl.example.com/api/v4/projects/1/uploads/abc/x.png");
    expect((init.headers as Record<string, string>)["PRIVATE-TOKEN"]).toBe("glpat-xyz");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/bun/gitlab.test.ts`
Expected: FAIL — `buildGraphql` is not defined.

- [ ] **Step 3: Implement gitlab.ts (builders + handlers)**

```typescript
// src/bun/gitlab.ts
import { loadConfig } from "./config";
import type {
  GraphqlArgs, GraphqlResult, RestArgs, RestResult, AssetArgs, AssetResult,
} from "@/lib/rpcContract";

interface Cfg { gitlabUrl: string; token: string }

// Bun's fetch accepts a `tls` option; type it locally so builders stay testable.
type FetchInit = RequestInit & { tls?: { rejectUnauthorized?: boolean } };

const authHeaders = (token: string): Record<string, string> => ({ "PRIVATE-TOKEN": token });
const tlsOff = { rejectUnauthorized: false } as const;

export function buildGraphql(cfg: Cfg, a: GraphqlArgs): { url: string; init: FetchInit } {
  return {
    url: `${cfg.gitlabUrl}/api/graphql`,
    init: {
      method: "POST",
      headers: { ...authHeaders(cfg.token), "Content-Type": "application/json" },
      body: JSON.stringify({ query: a.query, variables: a.variables }),
      tls: tlsOff,
    },
  };
}

export function buildRest(cfg: Cfg, a: RestArgs): { url: string; init: FetchInit } {
  return {
    url: `${cfg.gitlabUrl}/api${a.path}`,
    init: {
      method: a.method,
      headers: { ...authHeaders(cfg.token), Accept: "application/json" },
      tls: tlsOff,
    },
  };
}

export function buildAsset(cfg: Cfg, a: AssetArgs): { url: string; init: FetchInit } {
  return {
    url: `${cfg.gitlabUrl}/api${a.path}`,
    init: { headers: authHeaders(cfg.token), tls: tlsOff },
  };
}

function requireCfg(): Cfg {
  const { gitlabUrl, token } = loadConfig();
  if (!gitlabUrl || !token) throw new Error("GitLab is not configured");
  return { gitlabUrl, token };
}

export async function gitlabGraphql(a: GraphqlArgs): Promise<GraphqlResult> {
  const { url, init } = buildGraphql(requireCfg(), a);
  const res = await fetch(url, init as RequestInit);
  if (!res.ok && res.status === 401) return { status: 401, errors: [{ message: "Unauthorized" }] };
  const json = (await res.json().catch(() => ({}))) as { data?: unknown; errors?: { message: string }[] };
  return { status: res.status, data: json.data, errors: json.errors };
}

export async function gitlabRest(a: RestArgs): Promise<RestResult> {
  const { url, init } = buildRest(requireCfg(), a);
  const res = await fetch(url, init as RequestInit);
  const body = await res.text();
  return { ok: res.ok, status: res.status, statusText: res.statusText, body };
}

export async function gitlabAsset(a: AssetArgs): Promise<AssetResult> {
  const { url, init } = buildAsset(requireCfg(), a);
  const res = await fetch(url, init as RequestInit);
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/bun/gitlab.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bun/gitlab.ts src/bun/gitlab.test.ts
git commit -m "feat: GitLab request builders and Bun fetch handlers"
```

---

## Task 6: Wire RPC handlers into the Bun process + the view-side wrapper

Integration task — verified by running, not unit tests.

**Files:**
- Modify: `src/bun/index.ts`
- Create: `src/lib/rpc.ts`

- [ ] **Step 1: Register handlers on the window**

Replace `src/bun/index.ts` with:

```typescript
// src/bun/index.ts
import Electrobun, { BrowserWindow, BrowserView } from "electrobun/bun";
import { loadConfig, saveConfig, clearConfig } from "./config";
import { gitlabGraphql, gitlabRest, gitlabAsset } from "./gitlab";
import type { LumenRPC } from "@/lib/rpcContract";

const DEV_URL = "http://localhost:5173";
async function devServerUp(): Promise<boolean> {
  try { return (await fetch(DEV_URL, { method: "HEAD" })).ok; } catch { return false; }
}

const rpc = BrowserView.defineRPC<LumenRPC>({
  maxRequestTime: 30000,
  handlers: {
    requests: {
      gitlabGraphql,
      gitlabRest,
      gitlabAsset,
      getConfig: async () => {
        const { gitlabUrl } = loadConfig();
        return { url: gitlabUrl, configured: Boolean(gitlabUrl) };
      },
      saveConfig: async ({ url, token }) => { saveConfig({ url, token }); return { ok: true }; },
      clearConfig: async () => { clearConfig(); return { ok: true }; },
    },
    messages: {},
  },
});

const url = (await devServerUp()) ? `${DEV_URL}/index.html` : "views://mainview/index.html";
const win = new BrowserWindow({
  title: "Lumen",
  url,
  frame: { width: 1280, height: 860, x: 80, y: 80 },
  rpc,
});

void win;
void Electrobun;
```

> Verify against installed types: the kitchen example attaches RPC via `BrowserView.defineRPC` and passes it to `BrowserWindow({ rpc })`. If the installed version names these differently, adjust imports while keeping the `handlers.requests` shape identical.

- [ ] **Step 2: Create the typed view-side wrapper**

```typescript
// src/lib/rpc.ts
import Electrobun, { Electroview } from "electrobun/view";
import type { LumenRequests } from "./rpcContract";

const rpcDef = Electroview.defineRPC<any>({
  maxRequestTime: 30000,
  handlers: { requests: {}, messages: {} },
});
const electrobun = new Electrobun.Electroview({ rpc: rpcDef });

// One typed funnel over the loosely-typed framework client.
const request = (electrobun.rpc as any).request as LumenRequests;

export const rpc: LumenRequests = {
  gitlabGraphql: (a) => request.gitlabGraphql(a),
  gitlabRest: (a) => request.gitlabRest(a),
  gitlabAsset: (a) => request.gitlabAsset(a),
  getConfig: () => request.getConfig(),
  saveConfig: (a) => request.saveConfig(a),
  clearConfig: () => request.clearConfig(),
};
```

- [ ] **Step 3: Smoke-test RPC end to end**

Temporarily add to `src/main.ts` (top of file, after imports):
```typescript
import { rpc } from "@/lib/rpc";
rpc.getConfig().then((c) => console.log("[rpc] getConfig", c));
```
Run `bun run app:dev`, open the webview console. Expected: `[rpc] getConfig { url: ..., configured: ... }` logged (values reflect your `.env`/saved config). Then **remove** the temporary lines.

- [ ] **Step 4: Commit**

```bash
git add src/bun/index.ts src/lib/rpc.ts
git commit -m "feat: wire GitLab + config RPC handlers and typed view client"
```

---

## Task 7: Route GraphQL through RPC (client.ts fetch shim)

**Files:**
- Modify: `src/gitlab/client.ts`
- Test: `src/gitlab/client.test.ts` (extend existing)

- [ ] **Step 1: Write failing tests for the shim**

Add to `src/gitlab/client.test.ts` (create if absent):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const gitlabGraphql = vi.fn();
vi.mock("@/lib/rpc", () => ({ rpc: { gitlabGraphql } }));

import { rpcGraphqlFetch } from "./client";

beforeEach(() => gitlabGraphql.mockReset());

describe("rpcGraphqlFetch", () => {
  it("forwards query+variables to RPC and returns a JSON Response with the upstream status", async () => {
    gitlabGraphql.mockResolvedValue({ status: 200, data: { ok: true }, errors: undefined });
    const res = await rpcGraphqlFetch("https://ignored/graphql", {
      method: "POST",
      body: JSON.stringify({ query: "{ x }", variables: { a: 1 } }),
    });
    expect(gitlabGraphql).toHaveBeenCalledWith({ query: "{ x }", variables: { a: 1 } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true }, errors: undefined });
  });

  it("propagates a 401 so graphql-request raises an auth ClientError", async () => {
    gitlabGraphql.mockResolvedValue({ status: 401, errors: [{ message: "Unauthorized" }] });
    const res = await rpcGraphqlFetch("https://ignored/graphql", {
      method: "POST",
      body: JSON.stringify({ query: "{ x }" }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/gitlab/client.test.ts`
Expected: FAIL — `rpcGraphqlFetch` is not exported.

- [ ] **Step 3: Rewrite client.ts to use the RPC shim**

```typescript
// src/gitlab/client.ts
import { GraphQLClient } from 'graphql-request'
import { rpc } from '@/lib/rpc'

// The Bun main process is the runtime now: it holds the token and performs the
// upstream GraphQL fetch. graphql-request still drives query construction and
// ClientError semantics; we just swap its transport for an RPC round-trip and
// rebuild a Response (preserving the upstream status so errors.ts maps 401/403).
export async function rpcGraphqlFetch(_url: string, init?: RequestInit): Promise<Response> {
  const body = typeof init?.body === 'string' ? init.body : '{}'
  const { query, variables } = JSON.parse(body) as { query: string; variables?: Record<string, unknown> }
  const { status, data, errors } = await rpc.gitlabGraphql({ query, variables })
  return new Response(JSON.stringify({ data, errors }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// graphql-request requires an absolute endpoint; the value is unused (the shim
// ignores the URL), so any absolute placeholder works.
export const gqlClient = new GraphQLClient('https://gitlab.local/graphql', {
  fetch: rpcGraphqlFetch as unknown as typeof fetch,
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/gitlab/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/client.ts src/gitlab/client.test.ts
git commit -m "feat: route GraphQL through Bun RPC via a fetch shim"
```

---

## Task 8: Route REST through RPC (rest.ts)

**Files:**
- Modify: `src/gitlab/rest.ts`
- Test: `src/gitlab/rest.test.ts` (create/extend)

- [ ] **Step 1: Write failing tests for the RPC-backed REST helper**

```typescript
// src/gitlab/rest.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const gitlabRest = vi.fn();
vi.mock("@/lib/rpc", () => ({ rpc: { gitlabRest } }));

import { restGet, restPost } from "./rest";

beforeEach(() => gitlabRest.mockReset());

describe("rest over RPC", () => {
  it("GET parses a JSON body", async () => {
    gitlabRest.mockResolvedValue({ ok: true, status: 200, statusText: "OK", body: JSON.stringify({ id: 7 }) });
    expect(await restGet("/v4/projects/7")).toEqual({ id: 7 });
    expect(gitlabRest).toHaveBeenCalledWith({ method: "GET", path: "/v4/projects/7" });
  });

  it("returns null for an empty body", async () => {
    gitlabRest.mockResolvedValue({ ok: true, status: 200, statusText: "OK", body: "" });
    expect(await restPost("/v4/projects/7/star")).toBeNull();
  });

  it("maps 401 to an auth error", async () => {
    gitlabRest.mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized", body: "" });
    await expect(restGet("/v4/projects/7")).rejects.toMatchObject({ kind: "auth" });
  });

  it("maps other non-ok statuses to a network error", async () => {
    gitlabRest.mockResolvedValue({ ok: false, status: 500, statusText: "Server Error", body: "" });
    await expect(restGet("/v4/projects/7")).rejects.toMatchObject({ kind: "network" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/gitlab/rest.test.ts`
Expected: FAIL — current `rest.ts` uses `fetch`, not the mocked rpc; assertions on call args fail.

- [ ] **Step 3: Rewrite rest.ts over RPC**

```typescript
// src/gitlab/rest.ts
import { rpc } from '@/lib/rpc'
import type { GitLabError } from './errors'

// The Bun main process proxies REST to GITLAB_URL/api/* and attaches the token
// (see src/bun/gitlab.ts), so call sites stay token-free. We keep the same
// restGet/restPost surface and error mapping the proxy version had.
function httpError(status: number, statusText: string): GitLabError {
  if (status === 401 || status === 403) {
    return {
      kind: 'auth',
      message: 'Authentication failed — open Settings and check the GitLab URL and token (scope: api).',
    }
  }
  return { kind: 'network', message: `GitLab request failed (${status} ${statusText || 'error'}).` }
}

async function request<T>(method: 'GET' | 'POST', path: string): Promise<T> {
  const res = await rpc.gitlabRest({ method, path })
  if (!res.ok) throw httpError(res.status, res.statusText)
  return (res.body ? JSON.parse(res.body) : null) as T
}

export const restGet = <T>(path: string): Promise<T> => request<T>('GET', path)
export const restPost = <T>(path: string): Promise<T> => request<T>('POST', path)
```

> Note: the connection-level `normalizeError` catch is gone because the RPC layer resolves rather than throwing network errors; an RPC transport failure surfaces as a rejected promise that vue-query already handles. The auth message now points to Settings instead of `.env`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/gitlab/rest.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Update the old rest test if it referenced fetch**

If `src/gitlab/rest.test.ts` already existed and mocked `fetch`, those cases are replaced by Step 1. Delete any now-obsolete fetch-based cases so the file only contains the RPC-based tests.

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/rest.ts src/gitlab/rest.test.ts
git commit -m "feat: route REST through Bun RPC"
```

---

## Task 9: useGitlabAsset composable (path → blob URL)

**Files:**
- Create: `src/composables/useGitlabAsset.ts`
- Test: `src/composables/useGitlabAsset.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/composables/useGitlabAsset.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const gitlabAsset = vi.fn();
vi.mock("@/lib/rpc", () => ({ rpc: { gitlabAsset } }));

import { resolveAsset, __clearAssetCache } from "./useGitlabAsset";

beforeEach(() => {
  gitlabAsset.mockReset();
  __clearAssetCache();
  // jsdom lacks createObjectURL; stub it deterministically.
  let n = 0;
  (globalThis.URL as any).createObjectURL = vi.fn(() => `blob:fake/${n++}`);
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

describe("resolveAsset", () => {
  it("fetches bytes via RPC and returns a blob URL", async () => {
    gitlabAsset.mockResolvedValue({ base64: btoa("hello"), contentType: "image/png" });
    const url = await resolveAsset("/v4/projects/1/uploads/abc/x.png");
    expect(url).toBe("blob:fake/0");
    expect(gitlabAsset).toHaveBeenCalledWith({ path: "/v4/projects/1/uploads/abc/x.png" });
  });

  it("memoizes by path (one RPC call, one blob URL)", async () => {
    gitlabAsset.mockResolvedValue({ base64: btoa("x"), contentType: "image/png" });
    const a = await resolveAsset("/same");
    const b = await resolveAsset("/same");
    expect(a).toBe(b);
    expect(gitlabAsset).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/composables/useGitlabAsset.test.ts`
Expected: FAIL — `resolveAsset` not defined.

- [ ] **Step 3: Implement the composable**

```typescript
// src/composables/useGitlabAsset.ts
import { ref, watchEffect, type Ref } from 'vue'
import { rpc } from '@/lib/rpc'

const cache = new Map<string, Promise<string>>()

function base64ToBlob(base64: string, contentType: string): Blob {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: contentType })
}

/** Resolve a GitLab upload path to a memoized object-URL via the Bun RPC. */
export function resolveAsset(path: string): Promise<string> {
  const hit = cache.get(path)
  if (hit) return hit
  const p = rpc.gitlabAsset({ path }).then(({ base64, contentType }) =>
    URL.createObjectURL(base64ToBlob(base64, contentType)),
  )
  cache.set(path, p)
  return p
}

/** Test-only: drop the module cache. */
export function __clearAssetCache(): void {
  cache.clear()
}

/** Reactive helper: returns a ref that fills with the blob URL once resolved. */
export function useGitlabAsset(path: Ref<string> | (() => string)) {
  const url = ref<string | null>(null)
  watchEffect(() => {
    const p = typeof path === 'function' ? path() : path.value
    if (p) resolveAsset(p).then((u) => { url.value = u }).catch(() => { url.value = null })
  })
  return url
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/composables/useGitlabAsset.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useGitlabAsset.ts src/composables/useGitlabAsset.test.ts
git commit -m "feat: useGitlabAsset resolves upload paths to blob URLs over RPC"
```

---

## Task 10: Swap rendered markdown media to blob URLs

**Files:**
- Create: `src/lib/media.ts`
- Test: `src/lib/media.test.ts`
- Modify: `src/components/MarkdownText.vue`

- [ ] **Step 1: Write a failing test for the pure DOM resolver**

```typescript
// src/lib/media.test.ts
import { describe, it, expect, vi } from "vitest";
import { applyResolvedMedia } from "./media";

describe("applyResolvedMedia", () => {
  it("replaces src/href on every [data-media-src] element with resolved URLs", async () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<img data-media-src="/p/1/uploads/a/x.png" src="/p/1/uploads/a/x.png">' +
      '<a class="file-card" data-media-src="/p/1/uploads/b/y.zip" href="/p/1/uploads/b/y.zip">y</a>';
    const resolve = vi.fn((p: string) => Promise.resolve(`blob:${p}`));
    await applyResolvedMedia(root, resolve);
    expect(root.querySelector("img")!.getAttribute("src")).toBe("blob:/p/1/uploads/a/x.png");
    expect(root.querySelector("a")!.getAttribute("href")).toBe("blob:/p/1/uploads/b/y.zip");
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/media.test.ts`
Expected: FAIL — `applyResolvedMedia` not defined.

- [ ] **Step 3: Implement the resolver**

```typescript
// src/lib/media.ts
// After markdown render, every media element carries data-media-src holding the
// GitLab upload path. Under the views:// origin those paths don't resolve, so we
// fetch each through RPC and swap in a blob URL (src for media, href for files).
export async function applyResolvedMedia(
  root: HTMLElement,
  resolve: (path: string) => Promise<string>,
): Promise<void> {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-media-src]'))
  await Promise.all(
    els.map(async (el) => {
      const path = el.getAttribute('data-media-src')
      if (!path) return
      const url = await resolve(path)
      if (el.tagName === 'A') el.setAttribute('href', url)
      else el.setAttribute('src', url)
    }),
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/media.test.ts`
Expected: PASS.

- [ ] **Step 5: Call the resolver from MarkdownText.vue**

In `src/components/MarkdownText.vue`, locate the element that holds the rendered HTML (a `ref` on the container, e.g. `<div ref="host" v-html="html">`). If there is no template ref on that container, add `ref="host"`. Then add:

```typescript
import { ref, watch, nextTick } from 'vue'
import { applyResolvedMedia } from '@/lib/media'
import { resolveAsset } from '@/composables/useGitlabAsset'

const host = ref<HTMLElement | null>(null)
// `html` is the existing computed/prop holding the sanitized markdown HTML.
watch(html, async () => {
  await nextTick()
  if (host.value) await applyResolvedMedia(host.value, resolveAsset)
}, { immediate: true })
```

Match the existing variable name for the rendered HTML (`html`, `rendered`, etc.) — read the component first and use whatever it already calls it.

- [ ] **Step 6: Verify the component test still passes**

Run: `bun run test src/components/MarkdownText.test.ts`
Expected: PASS. If it asserts on `src` attributes of rendered media, the values are now blob URLs — update those assertions to check `data-media-src` (the stable path) instead.

- [ ] **Step 7: Commit**

```bash
git add src/lib/media.ts src/lib/media.test.ts src/components/MarkdownText.vue src/components/MarkdownText.test.ts
git commit -m "feat: swap rendered markdown media to blob URLs over RPC"
```

---

## Task 11: Resolve MediaViewer item sources to blob URLs

**Files:**
- Modify: `src/components/MediaViewer.vue`

- [ ] **Step 1: Resolve each item's src reactively**

In `src/components/MediaViewer.vue`, the template binds `current.src` and `item.src` (lines ~110–167). Those values are GitLab upload paths. Introduce a resolver-backed lookup so the bound URL is a blob URL.

Add to the `<script setup>`:
```typescript
import { reactive, watchEffect } from 'vue'
import { resolveAsset } from '@/composables/useGitlabAsset'

// Map raw upload path -> resolved blob URL, filled lazily.
const resolved = reactive<Record<string, string>>({})
function srcFor(path: string): string {
  if (!resolved[path]) resolveAsset(path).then((u) => { resolved[path] = u }).catch(() => {})
  return resolved[path] ?? '' // empty until resolved; element shows nothing briefly
}

// Eagerly resolve the currently shown item so it appears without a click delay.
watchEffect(() => { if (current.value?.src) srcFor(current.value.src) })
```
(Use the component's actual reactive handle for the current item — `current` may be a computed/ref; match its existing name.)

Then in the template, replace `:src="current.src"` with `:src="srcFor(current.src)"` and `:src="item.src"` with `:src="srcFor(item.src)"` (all three occurrences).

- [ ] **Step 2: Verify the component test still passes**

Run: `bun run test src/components/MediaViewer.test.ts`
Expected: PASS. If it asserts on `src` values, mock `@/composables/useGitlabAsset`'s `resolveAsset` to return the input path so assertions stay stable:
```typescript
vi.mock('@/composables/useGitlabAsset', () => ({ resolveAsset: (p: string) => Promise.resolve(p) }))
```

- [ ] **Step 3: Commit**

```bash
git add src/components/MediaViewer.vue src/components/MediaViewer.test.ts
git commit -m "feat: resolve MediaViewer sources to blob URLs over RPC"
```

---

## Task 12: Onboarding / Settings + hash router + guard

**Files:**
- Create: `src/views/SettingsView.vue`
- Modify: `src/router/index.ts`
- Test: `src/router/guard.test.ts`

- [ ] **Step 1: Switch the router to hash history, add the settings route + guard**

The `views://` origin has no server to resolve deep paths on reload, so use hash history. Replace `src/router/index.ts`:

```typescript
// src/router/index.ts
import { createRouter, createWebHashHistory } from 'vue-router'
import { rpc } from '@/lib/rpc'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'projects', component: () => import('@/views/ProjectPicker.vue') },
    {
      path: '/projects/:fullPath(.*)/issues',
      name: 'issues',
      component: () => import('@/views/IssueList.vue'),
      props: true,
    },
    {
      path: '/projects/:fullPath(.*)/issues/:iid',
      name: 'issue',
      component: () => import('@/views/IssueDetail.vue'),
      props: true,
    },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
  ],
})

// Send first-run / unconfigured users to Settings before anything tries to query.
router.beforeEach(async (to) => {
  if (to.name === 'settings') return true
  const { configured } = await rpc.getConfig()
  return configured ? true : { name: 'settings' }
})
```

- [ ] **Step 2: Write a failing test for the guard logic**

Extract the guard into a tiny pure function so it's testable without a live router. Create `src/router/guard.ts`:

```typescript
// src/router/guard.ts
export function nextRoute(toName: string | null | undefined, configured: boolean): true | { name: string } {
  if (toName === 'settings') return true
  return configured ? true : { name: 'settings' }
}
```
Then in `src/router/index.ts` replace the `beforeEach` body with:
```typescript
router.beforeEach(async (to) => {
  const { configured } = await rpc.getConfig()
  return nextRoute(to.name as string | undefined, configured)
})
```
and add `import { nextRoute } from './guard'`.

Test:
```typescript
// src/router/guard.test.ts
import { describe, it, expect } from "vitest";
import { nextRoute } from "./guard";

describe("nextRoute", () => {
  it("always allows the settings route", () => {
    expect(nextRoute("settings", false)).toBe(true);
  });
  it("allows other routes when configured", () => {
    expect(nextRoute("issues", true)).toBe(true);
  });
  it("redirects to settings when unconfigured", () => {
    expect(nextRoute("issues", false)).toEqual({ name: "settings" });
  });
});
```

- [ ] **Step 3: Run the guard test (fail, then pass after Step 2 files exist)**

Run: `bun run test src/router/guard.test.ts`
Expected: PASS once `guard.ts` exists (write the test first, watch it fail on missing module, then add `guard.ts`).

- [ ] **Step 4: Create the Settings view**

```vue
<!-- src/views/SettingsView.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { rpc } from '@/lib/rpc'

const router = useRouter()
const url = ref('')
const token = ref('')
const status = ref<'idle' | 'testing' | 'ok' | 'error'>('idle')
const message = ref('')

onMounted(async () => {
  const cfg = await rpc.getConfig()
  if (cfg.url) url.value = cfg.url
})

async function save() {
  status.value = 'testing'
  message.value = ''
  try {
    await rpc.saveConfig({ url: url.value.trim(), token: token.value.trim() })
    // Cheap connectivity probe through the new transport.
    const res = await rpc.gitlabGraphql({ query: '{ currentUser { username } }' })
    if (res.status === 200 && !res.errors?.length) {
      status.value = 'ok'
      router.replace({ name: 'projects' })
    } else {
      status.value = 'error'
      message.value = res.errors?.[0]?.message ?? `GitLab returned ${res.status}`
    }
  } catch (e) {
    status.value = 'error'
    message.value = e instanceof Error ? e.message : 'Could not reach GitLab'
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8">
    <h1 class="text-lg font-semibold">Connect to GitLab</h1>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-muted-foreground">GitLab URL</span>
      <input v-model="url" placeholder="https://gitlab.example.com"
        class="rounded-md border bg-transparent px-3 py-2" />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-muted-foreground">Personal Access Token (scope: api)</span>
      <input v-model="token" type="password" placeholder="glpat-…"
        class="rounded-md border bg-transparent px-3 py-2" />
    </label>
    <button :disabled="status === 'testing' || !url || !token" @click="save"
      class="rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">
      {{ status === 'testing' ? 'Testing…' : 'Save & Connect' }}
    </button>
    <p v-if="status === 'error'" class="text-sm text-destructive">{{ message }}</p>
  </div>
</template>
```
> Match the project's design tokens — read `.impeccable.md` and an existing view (e.g. `ProjectPicker.vue`) and align classes (amber accent, Hanken Grotesk) rather than the generic classes above.

- [ ] **Step 5: Verify unconfigured launch lands on Settings**

Run with a clean config: `LUMEN_CONFIG_DIR=$(mktemp -d) bun run app:dev` (and ensure no `GITLAB_*` in `.env`, or temporarily rename `.env.development`). Expected: window opens on the Settings screen. Enter URL + token, Save → lands on the projects list.

- [ ] **Step 6: Commit**

```bash
git add src/views/SettingsView.vue src/router/index.ts src/router/guard.ts src/router/guard.test.ts
git commit -m "feat: settings onboarding, hash router, and config guard"
```

---

## Task 13: Disk-persisted vue-query cache

**Files:**
- Create: `src/lib/persist.ts`
- Test: `src/lib/persist.test.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Install persistence packages**

Run:
```bash
bun add @tanstack/query-persist-client-core @tanstack/query-sync-storage-persister
```

- [ ] **Step 2: Write a failing test for the cache buster**

```typescript
// src/lib/persist.test.ts
import { describe, it, expect } from "vitest";
import { makeBuster } from "./persist";

describe("makeBuster", () => {
  it("is stable for the same url", () => {
    expect(makeBuster("https://gl.example.com")).toBe(makeBuster("https://gl.example.com"));
  });
  it("differs across instances so switching clears stale cache", () => {
    expect(makeBuster("https://a.example.com")).not.toBe(makeBuster("https://b.example.com"));
  });
  it("has a stable buster for the unconfigured (null) state", () => {
    expect(makeBuster(null)).toBe(makeBuster(null));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test src/lib/persist.test.ts`
Expected: FAIL — `makeBuster` not defined.

- [ ] **Step 4: Implement persist.ts**

```typescript
// src/lib/persist.ts
import { QueryClient } from '@tanstack/vue-query'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

const APP_VERSION = '1'

/** Cache key generation: changing instance (or app schema) invalidates the cache. */
export function makeBuster(url: string | null): string {
  return `lumen:${APP_VERSION}:${url ?? 'unconfigured'}`
}

/** Create a QueryClient with a localStorage-backed persister (disk-backed in the native webview). */
export function createPersistedQueryClient(url: string | null): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: 1000 * 60 * 60 * 24 } },
  })
  const persister = createSyncStoragePersister({ storage: window.localStorage })
  persistQueryClient({
    queryClient,
    persister,
    buster: makeBuster(url),
    maxAge: 1000 * 60 * 60 * 24, // 24h
  })
  return queryClient
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test src/lib/persist.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Wire the persisted client into main.ts**

Replace the mount section of `src/main.ts`. The app must learn the configured URL (for the buster) before mounting, so make boot async:

```typescript
import { createApp } from 'vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import { router } from './router'
import { rpc } from '@/lib/rpc'
import { createPersistedQueryClient } from '@/lib/persist'
import './styles.css'

// (keep the existing console boot-signature block here)

async function boot() {
  const { url } = await rpc.getConfig()
  const queryClient = createPersistedQueryClient(url)
  createApp(App)
    .use(router)
    .use(VueQueryPlugin, { queryClient })
    .mount('#app')
}
void boot()
```

- [ ] **Step 7: Verify cache survives restart**

Run `bun run app:dev`, navigate to an issue list (populates cache), close the window, relaunch `bun run app:dev`. Expected: the previously-viewed list renders instantly from cache before the network refresh completes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/persist.ts src/lib/persist.test.ts src/main.ts package.json bun.lock
git commit -m "feat: disk-persisted vue-query cache"
```

---

## Task 14: Cleanup, docs, and cross-platform build verification

**Files:**
- Modify: `vite.config.ts`
- Modify: `.env.example`
- Modify: `.impeccable.md` / memory notes (docs)
- Modify: `electrobun.config.ts` (confirm platform stanzas)

- [ ] **Step 1: Strip the now-dead proxy env from vite.config.ts**

`vite.config.ts` no longer needs `loadEnv`/`GITLAB_*`/headers. Reduce it to:

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import vueDevTools from 'vite-plugin-vue-devtools';
import { fileURLToPath } from 'node:url';

// Vite builds the SPA; the Electrobun Bun process is the runtime that talks to
// GitLab (see src/bun/). base:'./' keeps asset URLs relative for the views:// origin.
export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss(), vueDevTools()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
```

- [ ] **Step 2: Update .env.example**

Rewrite `.env.example` to explain that `.env` is now only a **dev convenience** auto-imported on first run; production stores config in the app-support file via Settings:

```
# DEV CONVENIENCE ONLY. On first launch with no saved config, the Bun process
# imports GITLAB_URL/GITLAB_TOKEN from the environment (see src/bun/config.ts).
# In a packaged app, configure via the in-app Settings screen instead; the token
# is then stored in the OS app-support dir, not here.
GITLAB_URL=https://gitlab.example-corp.com
GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxx   # Personal Access Token, scope: api

# TLS verification for the upstream GitLab is disabled in the Bun fetch layer
# (src/bun/gitlab.ts, tls.rejectUnauthorized=false) to accommodate internal-CA
# certs. If you point at a publicly-trusted host you can remove that option.
```

- [ ] **Step 3: Run the full test suite**

Run: `bun run test`
Expected: all suites PASS (existing component/pure-function tests + the new transport/config/asset/persist/guard tests).

- [ ] **Step 4: Production build for the host platform**

Run:
```bash
bun run build
```
Expected: `vue-tsc` passes (modulo the known codegen gap per `gitlab-codegen-workflow` memory — run `bun codegen` first if needed), Vite emits `dist/`, and `electrobun build` produces an app bundle under `build/`. Launch the produced bundle and confirm it opens and connects.

- [ ] **Step 5: Confirm cross-platform config stanzas**

Verify `electrobun.config.ts` has `mac`, `linux`, and `win` entries (from Task 1). Note in the commit message that Windows/Linux bundles require building on those hosts (or CI); code-signing/notarization is deferred.

- [ ] **Step 6: Update project memory**

Append a note to the lumen memory files that the runtime moved from the Vite proxy to the Electrobun Bun process, and that `bun run app:dev` / `app:hmr` launch the desktop app.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts .env.example electrobun.config.ts
git commit -m "chore: drop Vite proxy, document Electrobun runtime, verify build"
```

---

## Self-review notes

- **Spec coverage:** Shell/build (T1,T2,T14) · Bun process + RPC handlers (T5,T6) · config/secrets (T3) · transport seam (T7,T8) · assets (T9–T11) · onboarding/settings (T12) · persistence (T13) · cross-platform + error mapping reuse (T5,T8,T14). All spec sections map to tasks.
- **Hash-history catch:** added in T12 because `createWebHistory` breaks under `views://`.
- **Status-through-shim catch:** `GraphqlResult.status` (T4/T5/T7) preserves the existing `errors.ts` 401/403→auth mapping unchanged.
- **Framework-API risk:** T1/T6 carry explicit "verify against installed types" notes for `BrowserWindow`/`defineRPC`/`ElectrobunConfig` field names — the one genuine unknown, isolated to two integration tasks.
