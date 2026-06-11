import { ref, watch } from 'vue'
import type { Router } from 'vue-router'
import { rpc } from '@/shared/lib/rpc'
import type { AppStateSnapshot, McpAppCommand } from '@/shared/lib/rpcContract'

// Module singletons: IssueList pushes its selection/visible iids here; the
// installed watcher folds them into the next debounced snapshot report.
const selectedIids = ref<string[]>([])
const visibleIids = ref<string[]>([])

export function setReportedIssueIids(selected: string[], visible: string[]): void {
  selectedIids.value = selected
  visibleIids.value = visible
}

export function clearReportedIssueIids(): void {
  selectedIids.value = []
  visibleIids.value = []
}

// MCP navigate views → router route names. Internal routes (connect, settings,
// issues-window) are deliberately unreachable from agents.
const VIEW_TO_ROUTE: Record<string, string> = {
  dashboard: 'home',
  projects: 'projects',
  issues: 'issues',
  issue: 'issue',
  'merge-requests': 'merge-requests',
  'merge-request': 'merge-request',
  pipelines: 'pipelines',
}

const DEBOUNCE_MS = 150

let timer: ReturnType<typeof setTimeout> | null = null
let stopWatch: (() => void) | null = null
let commandListener: ((e: Event) => void) | null = null

/**
 * Main-window only (gated at the main.ts call site): report route/selection
 * state to the host (debounced trailing) and route lumen:mcp-command events
 * into vue-router. Never torn down in production — lives as long as the webview.
 */
export function installAppStateReport(router: Router): void {
  // Install-once: a second call would leak the prior watcher and duplicate the
  // window listener. The main window installs exactly once at boot.
  if (stopWatch) return

  const push = () => {
    const r = router.currentRoute.value
    const snapshot: AppStateSnapshot = {
      route: r.path,
      view: String(r.name ?? ''),
      projectPath: typeof r.params.fullPath === 'string' ? r.params.fullPath : null,
      selectedIssueIids: [...selectedIids.value],
      visibleIssueIids: [...visibleIids.value],
    }
    // Best-effort: a report that races app teardown must not surface.
    void rpc.reportAppState(snapshot).catch(() => {})
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(push, DEBOUNCE_MS)
  }
  stopWatch = watch([router.currentRoute, selectedIids, visibleIids], schedule, {
    immediate: true,
  })

  commandListener = (e: Event) => {
    const detail = (e as CustomEvent).detail as McpAppCommand | undefined
    if (!detail || detail.cmd !== 'navigate') return
    const name = VIEW_TO_ROUTE[detail.view]
    if (!name) return
    const params: Record<string, string> = {}
    if (detail.project) params.fullPath = detail.project
    if (detail.iid) params.iid = detail.iid
    void router.push({ name, params }).catch(() => {}) // bad params: stay put
  }
  window.addEventListener('lumen:mcp-command', commandListener)
}

/** Test-only: uninstall and reset module state. */
export function __resetAppStateReport(): void {
  if (timer) clearTimeout(timer)
  timer = null
  stopWatch?.()
  stopWatch = null
  if (commandListener) window.removeEventListener('lumen:mcp-command', commandListener)
  commandListener = null
  selectedIids.value = []
  visibleIids.value = []
}
