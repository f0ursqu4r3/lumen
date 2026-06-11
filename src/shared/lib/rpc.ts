import Electrobun, { Electroview } from 'electrobun/view'
import type { LumenRequests } from './rpcContract'

// One typed funnel over the loosely-typed framework client.
//
// The Electroview client is constructed lazily on first use rather than at
// module load: its constructor touches `window.receiveMessageFromBun`, which
// doesn't exist in non-Electrobun environments (e.g. jsdom under vitest), so
// eager construction would crash any module that merely imports this file.
// This is request-response only (no unsolicited bun->webview messages), so
// building the bridge right before the first request is safe -- it registers
// synchronously before anything is sent.
let request: LumenRequests | null = null
function client(): LumenRequests {
  if (!request) {
    const rpcDef = Electroview.defineRPC<any>({
      maxRequestTime: 30000,
      handlers: { requests: {}, messages: {} },
    })
    const electrobun = new Electrobun.Electroview({ rpc: rpcDef })
    request = (electrobun.rpc as any).request as LumenRequests
  }
  return request
}

export const rpc: LumenRequests = {
  gitlabGraphql: (a) => client().gitlabGraphql(a),
  gitlabRest: (a) => client().gitlabRest(a),
  gitlabAsset: (a) => client().gitlabAsset(a),
  gitlabUpload: (a) => client().gitlabUpload(a),
  getConfig: () => client().getConfig(),
  getInitialRoute: () => client().getInitialRoute(),
  saveConfig: (a) => client().saveConfig(a),
  clearConfig: () => client().clearConfig(),
  openExternal: (a) => client().openExternal(a),
  clipboardWriteText: (a) => client().clipboardWriteText(a),
  showNotification: (a) => client().showNotification(a),
  openIssueWindow: (a) => client().openIssueWindow(a),
  openIssuesWindow: (a) => client().openIssuesWindow(a),
  openSettingsWindow: () => client().openSettingsWindow(),
  getMcpStatus: () => client().getMcpStatus(),
  setMcpEnabled: (a) => client().setMcpEnabled(a),
  regenerateMcpToken: () => client().regenerateMcpToken(),
  revealMcpToken: () => client().revealMcpToken(),
  getStartupPrefs: () => client().getStartupPrefs(),
  setRestoreOnStartup: (a) => client().setRestoreOnStartup(a),
  connectClaudeCode: () => client().connectClaudeCode(),
  connectCodex: () => client().connectCodex(),
  notifyCacheCleared: () => client().notifyCacheCleared(),
  getServerHealth: () => client().getServerHealth(),
  retryServerNow: () => client().retryServerNow(),
  resetServerHealth: () => client().resetServerHealth(),
  reportAppState: (a) => client().reportAppState(a),
  broadcastTheme: (a) => client().broadcastTheme(a),
}
