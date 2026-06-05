import { watch, type Ref } from 'vue'
import { rpc } from '@/lib/rpc'
import { isTerminalPipeline, statusMeta } from '@/gitlab/pipelineParams'
import type { Pipeline } from '@/composables/usePipelines'
import type { PipelineWatch } from '@/composables/usePipelineWatch'

// Fires a native desktop notification when a pipeline the user has *subscribed
// to* (via the per-run bell) reaches a terminal status. Notifications are
// opt-in: nothing alerts unless its id is in the watch set.
//
// On completion we both notify and unwatch, which means: (a) a run never alerts
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

export function usePipelineNotifications(
  pipelines: Ref<readonly Pipeline[]>,
  projectLabel: Ref<string>,
  watchStore: Pick<PipelineWatch, 'isWatched' | 'unwatch'>,
) {
  watch(
    pipelines,
    (list) => {
      for (const p of list) {
        if (watchStore.isWatched(p.id) && isTerminalPipeline(p.status)) {
          notify(p, projectLabel.value)
          watchStore.unwatch(p.id)
        }
      }
    },
    { immediate: true },
  )
}

function notify(p: Pipeline, projectLabel: string) {
  const verb = VERB[p.status] ?? statusMeta(p.status).label.toLowerCase()
  const where = [projectLabel, p.ref].filter(Boolean).join(' · ')
  void rpc.showNotification({
    title: `Pipeline ${verb}`,
    subtitle: where || undefined,
    body: `#${p.iid}`,
    // Let failures ring; successful runs land quietly.
    silent: p.status !== 'FAILED',
  })
}
