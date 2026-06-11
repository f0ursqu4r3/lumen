import type { ThemeState } from '@/shared/lib/rpcContract'

// Pure: build the JS a window runs to re-apply a broadcast theme change. The
// lumen:theme-changed listener (webview) re-applies the carried ThemeState.
export function buildThemeBroadcastJs(state: ThemeState): string {
  return `window.dispatchEvent(new CustomEvent('lumen:theme-changed',{detail:${JSON.stringify(state)}}))`
}
