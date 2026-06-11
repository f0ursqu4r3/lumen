import { createApp } from 'vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import { router } from './router'
import { rpc } from '@/shared/lib/rpc'
import { createPersistedQueryClient } from '@/shared/lib/persist'
import { installServerHealth } from '@/shared/composables/useSession'
import { installAppStateReport } from '@/shared/composables/useAppStateReport'
import { installMcpCacheSync } from '@/shared/composables/useMcpCacheSync'
import './styles.css'

// A quiet boot signature for whoever opens the console — styled like a telemetry
// readout, in keeping with the instrument it sits behind. (Discovered, not announced.)
console.log(
  '%c●%c lumen%c ▸ operational',
  'color:oklch(0.82 0.142 81);font-size:13px;text-shadow:0 0 8px oklch(0.82 0.142 81/0.7)',
  'color:oklch(0.945 0.006 256);font-weight:600;font-family:ui-monospace,monospace',
  'color:oklch(0.66 0.018 256);font-family:ui-monospace,monospace',
)

async function boot() {
  const [{ url }, { route }] = await Promise.all([rpc.getConfig(), rpc.getInitialRoute()])
  // Popout windows load the bare app (the views:// scheme can't carry the route
  // in the initial URL fragment); the host hands us the route and we apply it
  // before the router installs, so vue-router's first navigation lands on it with
  // no flash of the default route. The main window gets route === null.
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
  // MCP app-control: only the main window reports state / accepts drive
  // commands. Popouts and the settings window get a non-null initial route.
  if (!route) installAppStateReport(router)
  createApp(App).use(router).use(VueQueryPlugin, { queryClient }).mount('#app')
}
void boot().catch((err) => {
  console.error('[lumen] failed to start', err)
})
