import { parseLumenUrl, intentToLocation } from '../shared/lib/deepLink'

/** Capabilities the deep-link router needs from the host, injected so this stays testable. */
export interface DeepLinkHost {
  /** Is a native popout window already open for this issue key (`${project}#${iid}`)? */
  hasIssueWindow: (key: string) => boolean
  /** Focus that popout window. */
  focusIssueWindow: (key: string) => void
  /** Bring the main window forward. */
  focusMain: () => void
  /** Run JS in the main window's webview; { ok: false } if it's gone. */
  driveMain: (js: string) => { ok: boolean }
}

/** Build the executeJavascript payload that dispatches a lumen:deeplink event in the webview. */
export function buildDeepLinkJs(location: unknown): string {
  return `window.dispatchEvent(new CustomEvent('lumen:deeplink',{detail:${JSON.stringify(location)}}))`
}

/**
 * Routes Electrobun open-url events. An issue link whose popout is already open focuses that
 * window; otherwise the main window is focused and the route forwarded to its webview. Links
 * that arrive before the main webview has mounted (cold launch) are buffered and replayed on
 * markReady (driven by the first reportAppState from the main window).
 */
export function createDeepLinkRouter(host: DeepLinkHost) {
  let mainReady = false
  const pending: string[] = []

  function dispatch(raw: string): void {
    const intent = parseLumenUrl(raw)
    if (intent.kind === 'issue' && host.hasIssueWindow(`${intent.project}#${intent.iid}`)) {
      host.focusIssueWindow(`${intent.project}#${intent.iid}`)
      return
    }
    host.focusMain()
    const location = intentToLocation(intent)
    if (location) host.driveMain(buildDeepLinkJs(location))
  }

  return {
    /** Handle an incoming open-url. Buffers until the main window is ready. */
    handleOpenUrl(raw: string): void {
      if (!mainReady) {
        pending.push(raw)
        return
      }
      dispatch(raw)
    },
    /** Mark the main webview mounted and replay any buffered links. Idempotent. */
    markReady(): void {
      if (mainReady) return
      mainReady = true
      for (const raw of pending.splice(0)) dispatch(raw)
    },
  }
}
