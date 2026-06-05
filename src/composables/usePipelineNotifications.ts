import { watch, type Ref } from 'vue'
import { rpc } from '@/lib/rpc'
import { isTerminalPipeline, statusMeta } from '@/gitlab/pipelineParams'
import { pushToast, type ToastTone } from '@/composables/useToast'
import { isAppActive } from '@/lib/appActive'
import type { Pipeline } from '@/composables/usePipelines'
import type { PipelineWatch } from '@/composables/usePipelineWatch'

// Alerts when a pipeline the user has *subscribed to* (via the per-run bell)
// reaches a terminal status. Notifications are opt-in: nothing alerts unless its
// id is in the watch set.
//
// Two channels: an in-app toast *always* fires, and an OS notification fires
// *only when the app isn't active* — so you're not double-pinged while looking
// at Lumen, but you still hear about it when you're elsewhere.
//
// On completion we both alert and unwatch, which means: (a) a run never alerts
// twice, and (b) a subscription that finished while the app was closed alerts
// once on the next launch (immediate run) and then clears itself — "persist only
// until complete". We can't subscribe to a terminal pipeline (the bell only
// shows on in-flight runs), so "watched + terminal" always means a finish we owe
// the user a ping for.
const VERB: Record<string, string> = {
  SUCCESS: 'passed',
  FAILED: 'failed',
  CANCELED: 'was canceled',
  SKIPPED: 'was skipped',
}

const TONE: Record<string, ToastTone> = {
  SUCCESS: 'success',
  FAILED: 'failed',
}

export function usePipelineNotifications(
  pipelines: Ref<readonly Pipeline[]>,
  projectLabel: Ref<string>,
  watchStore: Pick<PipelineWatch, 'isWatched' | 'unwatch'>,
  toHref?: (p: Pipeline) => string | null,
) {
  watch(
    pipelines,
    (list) => {
      for (const p of list) {
        if (watchStore.isWatched(p.id) && isTerminalPipeline(p.status)) {
          notify(p, projectLabel.value, toHref?.(p) ?? undefined)
          watchStore.unwatch(p.id)
        }
      }
    },
    { immediate: true },
  )
}

// The shared alert path: an in-app toast always, plus an OS notification when the
// app isn't active.
function notify(p: Pipeline, projectLabel: string, href?: string) {
  const verb = VERB[p.status] ?? statusMeta(p.status).label.toLowerCase()
  const where = [projectLabel, p.ref].filter(Boolean).join(' · ')
  const title = `Pipeline ${verb}`

  // Always: an in-app toast.
  pushToast({ title, description: `${where} · #${p.iid}`, tone: TONE[p.status] ?? 'info', href })

  // Only when we're not the active window: an OS notification on top.
  if (!isAppActive()) {
    void rpc.showNotification({
      title,
      subtitle: where || undefined,
      body: `#${p.iid}`,
      // Let failures ring; successful runs land quietly.
      silent: p.status !== 'FAILED',
    })
  }
}
