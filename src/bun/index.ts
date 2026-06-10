import Electrobun, { BrowserWindow, BrowserView, Utils, ApplicationMenu } from 'electrobun/bun'
import { loadConfig, saveConfig, clearConfig } from './config'
import { gitlabGraphql, gitlabRest, gitlabAsset } from './gitlab'
import type { LumenRPC } from '@/shared/lib/rpcContract'
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

// Resolve the base app URL once; every native window (main + per-issue) loads
// off it. app:hmr sets LUMEN_HMR=1; only then do we poll for the Vite dev server.
const url = await resolveStartUrl({ hmr: process.env.LUMEN_HMR === '1' })

// One native window per issue, keyed by `${fullPath}#${iid}`, so re-expanding an
// already-open issue focuses it instead of spawning a duplicate.
const issueWindows = new Map<string, BrowserWindow>()

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
  const issueWin = new BrowserWindow({
    title: `#${iid} · ${repo}`,
    // Load the bare app; the route is applied client-side (issueWindowRoute,
    // handed over via getInitialRoute) — see issueWindow.ts for why it can't ride
    // in this URL's fragment under views://.
    url,
    frame: { width: 720, height: 900, x: 120 + offset, y: 120 + offset },
    rpc: buildRpc(issueWindowRoute(fullPath, iid)),
  })
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
  const issuesWin = new BrowserWindow({
    title: `${iids.length} issues · ${repo}`,
    // See openIssueWindow: bare base + client-side route via getInitialRoute.
    url,
    frame: { width: 760, height: 920, x: 140 + offset, y: 140 + offset },
    rpc: buildRpc(issuesWindowRoute(fullPath, iids)),
  })
  void issuesWin
  return { ok: true }
}

function openSettingsWindow(): { ok: boolean } {
  if (settingsWindow) {
    settingsWindow.activate()
    return { ok: true }
  }
  const win = new BrowserWindow({
    title: 'Settings',
    url,
    frame: { width: 820, height: 600, x: 160, y: 120 },
    rpc: buildRpc(settingsWindowRoute()),
  })
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
      },
      messages: {},
    },
  } satisfies LumenRPC)
}

const win = new BrowserWindow({
  title: 'Lumen',
  url,
  frame: { width: 1280, height: 860, x: 80, y: 80 },
  rpc: buildRpc(),
})

// Start the in-process MCP server iff the user enabled it in config. Off by
// default; localhost-only + bearer-gated (see src/bun/mcp/server.ts).
startMcpIfEnabled()

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
