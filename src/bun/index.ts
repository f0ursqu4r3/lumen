import Electrobun, { BrowserWindow, BrowserView, Utils, ApplicationMenu } from 'electrobun/bun'
import { loadConfig, saveConfig, clearConfig } from './config'
import { gitlabGraphql, gitlabRest, gitlabAsset, gitlabUpload } from './gitlab'
import type { LumenRPC } from '@/shared/lib/rpcContract'
import { buildThemeBroadcastJs } from './themeBroadcast'
export { buildThemeBroadcastJs } from './themeBroadcast'
import { resolveStartUrl } from './startUrl'
import { issueWindowRoute, issuesWindowRoute } from './issueWindow'
import { settingsWindowRoute } from './settingsWindow'
import { buildAppMenu, DEVTOOLS_ACTION, SETTINGS_ACTION } from './menu'
import {
  startMcpIfEnabled,
  stopMcp,
  getMcpStatus,
  setMcpEnabled,
  regenerateMcpToken,
  revealMcpToken,
} from './mcp/server'
import {
  startServerHealth,
  retryNow,
  getHealth,
  resetForReconnect,
  classifyStatus,
  type Outcome,
} from './serverHealth'
import { cacheSnapshot, setHostActions, type WindowInfo } from './mcp/app/bridge'
// Relative on purpose: electrobun's host build doesn't resolve tsconfig "@/" paths
// (the "@/" type-only imports above survive because they're erased before bundling).
import { PROBE_QUERY } from '../shared/lib/gitlabQueries'

// Resolve the base app URL once; every native window (main + per-issue) loads
// off it. app:hmr sets LUMEN_HMR=1; only then do we poll for the Vite dev server.
const url = await resolveStartUrl({ hmr: process.env.LUMEN_HMR === '1' })

// One native window per issue, keyed by `${fullPath}#${iid}`, so re-expanding an
// already-open issue focuses it instead of spawning a duplicate.
const issueWindows = new Map<string, BrowserWindow>()

// Combined multi-issue windows are not deduped/focused, but the MCP app-state
// tool lists them, so track membership for counting.
const issuesWindows = new Set<BrowserWindow>()

// Every native window registers here so host-owned state (server health) can be
// broadcast to all of them. Pruned on close.
const windows = new Set<BrowserWindow>()

function track(w: BrowserWindow): BrowserWindow {
  windows.add(w)
  w.on('close', () => windows.delete(w))
  return w
}

function broadcast(js: string): void {
  for (const w of windows) w.webview.executeJavascript(js)
}

let settingsWindow: BrowserWindow | null = null

function openIssueWindow({ fullPath, iid }: { fullPath: string; iid: string }): {
  ok: boolean
} {
  const key = `${fullPath}#${iid}`
  const existing = issueWindows.get(key)
  if (existing) {
    existing.activate()
    return { ok: true }
  }
  const repo = fullPath.split('/').at(-1) ?? fullPath
  // Cascade each new window so stacked issue windows don't perfectly overlap.
  const offset = issueWindows.size * 24
  const issueWin = track(
    new BrowserWindow({
      title: `#${iid} · ${repo}`,
      // Load the bare app; the route is applied client-side (issueWindowRoute,
      // handed over via getInitialRoute) — see issueWindow.ts for why it can't ride
      // in this URL's fragment under views://.
      url,
      frame: { width: 720, height: 900, x: 120 + offset, y: 120 + offset },
      rpc: buildRpc(issueWindowRoute(fullPath, iid)),
    }),
  )
  // Per-window close event (scoped by window id) keeps the registry accurate.
  // Register before inserting so a synchronous close can't strand a stale entry.
  issueWin.on('close', () => issueWindows.delete(key))
  issueWindows.set(key, issueWin)
  return { ok: true }
}

function openIssuesWindow({ fullPath, iids }: { fullPath: string; iids: string[] }): {
  ok: boolean
} {
  const repo = fullPath.split('/').at(-1) ?? fullPath
  // Cascade off the count of all open issue windows so a combined window doesn't
  // land exactly on a single-issue one. No registry: combined windows are not
  // deduped or focused — each "Open combined" is a fresh window.
  const offset = issueWindows.size * 24
  const issuesWin = track(
    new BrowserWindow({
      title: `${iids.length} issues · ${repo}`,
      // See openIssueWindow: bare base + client-side route via getInitialRoute.
      url,
      frame: { width: 760, height: 920, x: 140 + offset, y: 140 + offset },
      rpc: buildRpc(issuesWindowRoute(fullPath, iids)),
    }),
  )
  issuesWindows.add(issuesWin)
  issuesWin.on('close', () => issuesWindows.delete(issuesWin))
  return { ok: true }
}

function openSettingsWindow(): { ok: boolean } {
  if (settingsWindow) {
    settingsWindow.activate()
    return { ok: true }
  }
  const win = track(
    new BrowserWindow({
      title: 'Settings',
      url,
      frame: { width: 820, height: 600, x: 160, y: 120 },
      rpc: buildRpc(settingsWindowRoute()),
    }),
  )
  win.on('close', () => {
    settingsWindow = null
  })
  settingsWindow = win
  return { ok: true }
}

// Each native window needs its own RPC bridge; build a fresh config per window.
// `initialRoute` is the hash route the window opens at — null for the main
// window (default route), set for popouts (which can't carry the route in their
// views:// URL fragment). The webview reads it via getInitialRoute at boot.
function buildRpc(initialRoute: string | null = null) {
  return BrowserView.defineRPC<any>({
    maxRequestTime: 30000,
    handlers: {
      requests: {
        gitlabGraphql,
        gitlabRest,
        gitlabAsset,
        gitlabUpload,
        getConfig: async () => {
          const { gitlabUrl, token } = loadConfig()
          return {
            url: gitlabUrl,
            configured: Boolean(gitlabUrl && token),
            tokenSuffix: token ? token.slice(-6) : null,
          }
        },
        getInitialRoute: async () => ({ route: initialRoute }),
        saveConfig: async ({ url, token }) => {
          saveConfig({ url, token })
          return { ok: true }
        },
        getServerHealth: async () => getHealth(),
        retryServerNow: async () => {
          retryNow()
          return { ok: true }
        },
        resetServerHealth: async () => {
          resetForReconnect() // a confirmed-good (re)connect → force health back to ok
          return { ok: true }
        },
        clearConfig: async () => {
          clearConfig()
          stopMcp() // the MCP server serves with the GitLab token; stop it on disconnect
          // The disconnect originates in the settings window's JS context; bridge
          // to the main window so it drops cached data and returns to Connect.
          win.webview.executeJavascript(
            "window.dispatchEvent(new CustomEvent('lumen:disconnected'))",
          )
          settingsWindow?.close()
          return { ok: true }
        },
        openExternal: async ({ url }) => ({ ok: Utils.openExternal(url) }),
        clipboardWriteText: async ({ text }) => {
          Utils.clipboardWriteText(text)
          return { ok: true }
        },
        showNotification: async ({ title, body, subtitle, silent }) => {
          Utils.showNotification({ title, body, subtitle, silent })
          return { ok: true }
        },
        openIssueWindow: async ({ fullPath, iid }) => openIssueWindow({ fullPath, iid }),
        openIssuesWindow: async ({ fullPath, iids }) => openIssuesWindow({ fullPath, iids }),
        openSettingsWindow: async () => openSettingsWindow(),
        getMcpStatus: async () => getMcpStatus(),
        setMcpEnabled: async (a) => setMcpEnabled(a),
        regenerateMcpToken: async () => regenerateMcpToken(),
        revealMcpToken: async () => revealMcpToken(),
        notifyCacheCleared: async () => {
          win.webview.executeJavascript(
            "window.dispatchEvent(new CustomEvent('lumen:cache-cleared'))",
          )
          return { ok: true }
        },
        reportAppState: async (s) => {
          // Only the main window (initialRoute === null) may write the snapshot;
          // popouts never report by construction, host-enforced.
          if (initialRoute === null) cacheSnapshot(s)
          return { ok: true }
        },
        broadcastTheme: async (state) => {
          // Re-apply in every window (the originator already applied locally +
          // wrote localStorage; re-applying there is idempotent). Mirrors the
          // server-health / mcp-cache broadcast pattern.
          broadcast(buildThemeBroadcastJs(state))
          return { ok: true }
        },
      },
      messages: {},
    },
  } satisfies LumenRPC)
}

const win = track(
  new BrowserWindow({
    title: 'Lumen',
    url,
    frame: { width: 1280, height: 860, x: 80, y: 80 },
    rpc: buildRpc(),
  }),
)

// Hand the MCP app-control tools their host capabilities. Injected (not
// imported from the tools) to keep mcp/app free of entrypoint imports.
setHostActions({
  openIssueWindow,
  openIssuesWindow,
  openSettingsWindow,
  notify: (a) => Utils.showNotification(a),
  driveMain: (js) => {
    if (!windows.has(win)) return { ok: false } // main window closed
    win.webview.executeJavascript(js)
    return { ok: true }
  },
  broadcast: (js) => broadcast(js),
  listWindows: (): WindowInfo[] => {
    const out: WindowInfo[] = []
    if (windows.has(win)) out.push({ kind: 'main' })
    for (const key of issueWindows.keys()) out.push({ kind: 'issue', key })
    for (const _ of issuesWindows) out.push({ kind: 'issues-window' })
    if (settingsWindow) out.push({ kind: 'settings' })
    return out
  },
})

// Start the in-process MCP server iff the user enabled it in config. Off by
// default; localhost-only + bearer-gated (see src/bun/mcp/server.ts).
startMcpIfEnabled()

// One host-owned recovery loop, broadcast to every window (see src/bun/serverHealth.ts).
startServerHealth({
  probe: async (): Promise<Outcome> => {
    const res = await gitlabGraphql({ query: PROBE_QUERY })
    return classifyStatus(res.status, Boolean(res.errors?.length))
  },
  broadcast: (health) => {
    broadcast(
      `window.dispatchEvent(new CustomEvent('lumen:server-health',{detail:${JSON.stringify(health)}}))`,
    )
  },
})

// Without an application menu, macOS has no Edit menu, so ⌘C/⌘V/⌘X/⌘A have
// nothing to dispatch to and clipboard does not work in the webview. The Develop
// menu's "Toggle Developer Tools" opens the inspector (developer mode).
ApplicationMenu.setApplicationMenu(buildAppMenu('Lumen'))
ApplicationMenu.on('application-menu-clicked', (event) => {
  const action = (event as { data?: { action?: string } })?.data?.action
  if (action === DEVTOOLS_ACTION) {
    win.webview.toggleDevTools()
  } else if (action === SETTINGS_ACTION) {
    openSettingsWindow()
  }
})

void win
void Electrobun
