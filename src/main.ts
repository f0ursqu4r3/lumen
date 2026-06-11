import { createApp } from 'vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import { router } from './router'
import { rpc } from '@/shared/lib/rpc'
import { createPersistedQueryClient } from '@/shared/lib/persist'
import { installServerHealth } from '@/shared/composables/useSession'
import { installAppStateReport } from '@/shared/composables/useAppStateReport'
import { installMcpCacheSync } from '@/shared/composables/useMcpCacheSync'
import { installThemeSync } from '@/shared/theme/installThemeSync'
import { applyStoredTheme } from '@/shared/theme/applyTheme'
import './styles.css'

// A quiet boot signature for whoever opens the console — styled like a telemetry
// readout, in keeping with the instrument it sits behind. (Discovered, not announced.)
// Splash uses the canonical amber literal intentionally — a static console
// string, not a rendered color, so it's exempt from the theme token refactor.
console.log(
  '%c●%c lumen%c ▸ operational',
  'color:oklch(0.82 0.142 81);font-size:13px;text-shadow:0 0 8px oklch(0.82 0.142 81/0.7)',
  'color:oklch(0.945 0.006 256);font-weight:600;font-family:ui-monospace,monospace',
  'color:oklch(0.66 0.018 256);font-family:ui-monospace,monospace',
)

async function boot() {
  const [{ url }, { route, isMain }] = await Promise.all([rpc.getConfig(), rpc.getInitialRoute()])
  // Popout windows load the bare app (the views:// scheme can't carry the route
  // in the initial URL fragment); the host hands us the route and we apply it
  // before the router installs, so vue-router's first navigation lands on it with
  // no flash of the default route. route is null for the main window by default,
  // but may be non-null when a previous session route is restored.
  if (route) window.location.hash = route
  const queryClient = createPersistedQueryClient(url)
  // App-lifetime: mirror host-owned server health into sessionState (banner +
  // overlay) and refetch this window's queries when the server recovers. Never
  // torn down — lives as long as the webview.
  installServerHealth(queryClient)
  // Every window — main and popouts — refreshes its issue views when an MCP
  // write lands in the host. (Unlike app-state report, this is not main-only.)
  // Coexists with installAppStateReport's lumen:mcp-command listener: each
  // handles a distinct cmd ('invalidate' vs 'navigate'), so they never collide.
  installMcpCacheSync(queryClient)
  // Every window re-applies and re-mirrors a theme change broadcast by any
  // window (host fans out lumen:theme-changed). Apply + persist only — never
  // re-broadcasts, so there is no cross-window feedback loop.
  installThemeSync()
  // Re-apply the stored theme through the tested helper: coerces legacy/unknown
  // ids to the default and clears any stale data-theme/data-idiom the inline
  // boot script set from an id the registry no longer knows.
  applyStoredTheme(document, localStorage)
  // MCP app-control + session-route reporting live only in the main window. The
  // main window is identified by isMain (it may now carry a restored route, so a
  // null route no longer distinguishes it). Popouts and settings get isMain=false.
  if (isMain) installAppStateReport(router)
  createApp(App).use(router).use(VueQueryPlugin, { queryClient }).mount('#app')
}
void boot().catch((err) => {
  console.error('[lumen] failed to start', err)
})
