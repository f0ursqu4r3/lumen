import type { QueryClient } from '@tanstack/vue-query'
import type { McpAppCommand } from '@/shared/lib/rpcContract'

let listener: ((e: Event) => void) | null = null

/**
 * Every window (main + popouts + pager) installs this so an MCP write in the
 * host refreshes whatever issue views this window has mounted. Invalidation only
 * refetches *active* queries; inactive ones go stale and refetch on next mount.
 * Dirty issue drafts are preserved by useIssueDraft (it re-syncs only while
 * clean), so a forced refetch never clobbers unsaved edits.
 */
export function installMcpCacheSync(queryClient: QueryClient): void {
  // Install-once: a second call would duplicate the window listener.
  if (listener) return
  listener = (e: Event) => {
    const d = (e as CustomEvent).detail as McpAppCommand | undefined
    if (!d || d.cmd !== 'invalidate' || d.resource !== 'issue') return
    void queryClient.invalidateQueries({ queryKey: ['issues', d.project] })
    if (d.iid) {
      void queryClient.invalidateQueries({ queryKey: ['issue', d.project, d.iid] })
      void queryClient.invalidateQueries({ queryKey: ['workItemStatus', d.project, d.iid] })
    }
  }
  window.addEventListener('lumen:mcp-command', listener)
}

/** Test-only: uninstall and reset module state. */
export function __resetMcpCacheSync(): void {
  if (listener) window.removeEventListener('lumen:mcp-command', listener)
  listener = null
}
