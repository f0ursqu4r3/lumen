import Electrobun, { BrowserWindow, BrowserView, Utils, ApplicationMenu } from 'electrobun/bun'
import { loadConfig, saveConfig, clearConfig } from './config'
import { gitlabGraphql, gitlabRest, gitlabAsset } from './gitlab'
import type { LumenRPC } from '@/shared/lib/rpcContract'
import { resolveStartUrl } from './startUrl'
import { issueWindowUrl, issuesWindowUrl } from './issueWindow'
import { buildAppMenu, DEVTOOLS_ACTION, SETTINGS_ACTION } from './menu'

// Resolve the base app URL once; every native window (main + per-issue) loads
// off it. app:hmr sets LUMEN_HMR=1; only then do we poll for the Vite dev server.
const url = await resolveStartUrl({ hmr: process.env.LUMEN_HMR === '1' })

// One native window per issue, keyed by `${fullPath}#${iid}`, so re-expanding an
// already-open issue focuses it instead of spawning a duplicate.
const issueWindows = new Map<string, BrowserWindow>()

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
    url: issueWindowUrl(url, fullPath, iid),
    frame: { width: 720, height: 900, x: 120 + offset, y: 120 + offset },
    rpc: buildRpc(),
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
    url: issuesWindowUrl(url, fullPath, iids),
    frame: { width: 760, height: 920, x: 140 + offset, y: 140 + offset },
    rpc: buildRpc(),
  })
  void issuesWin
  return { ok: true }
}

// Each native window needs its own RPC bridge; build a fresh config per window.
// The handler bodies are identical to the original single-window definition,
// plus openIssueWindow.
function buildRpc() {
  return BrowserView.defineRPC<any>({
    maxRequestTime: 30000,
    handlers: {
      requests: {
        gitlabGraphql,
        gitlabRest,
        gitlabAsset,
        getConfig: async () => {
          const { gitlabUrl } = loadConfig()
          return { url: gitlabUrl, configured: Boolean(gitlabUrl) }
        },
        saveConfig: async ({ url, token }) => {
          saveConfig({ url, token })
          return { ok: true }
        },
        clearConfig: async () => {
          clearConfig()
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

// Without an application menu, macOS has no Edit menu, so ⌘C/⌘V/⌘X/⌘A have
// nothing to dispatch to and clipboard does not work in the webview. The Develop
// menu's "Toggle Developer Tools" opens the inspector (developer mode).
ApplicationMenu.setApplicationMenu(buildAppMenu('Lumen'))
ApplicationMenu.on('application-menu-clicked', (event) => {
  const action = (event as { data?: { action?: string } })?.data?.action
  if (action === DEVTOOLS_ACTION) {
    win.webview.toggleDevTools()
  } else if (action === SETTINGS_ACTION) {
    // Bridge host → webview: dispatch the event the webview's useSettings listens for.
    win.webview.executeJavascript(
      "window.dispatchEvent(new CustomEvent('lumen:open-settings'))",
    )
  }
})

void win
void Electrobun
