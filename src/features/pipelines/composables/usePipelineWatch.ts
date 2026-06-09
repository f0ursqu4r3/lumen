import { useLocalStorage } from '@vueuse/core'
import { type Ref } from 'vue'

const storageKey = (fullPath: string) => `lumen:pipeline-watch:${fullPath}`

// Per-project set of pipeline ids the user has subscribed to alerts for.
// Persisted (like saved views) so a run you're waiting on is still watched after
// a relaunch — but entries are pruned the moment the pipeline completes (see
// usePipelineNotifications), so this only ever holds in-flight subscriptions and
// never grows into a history. Notifications are opt-in: nothing alerts until an
// id is in here.
export function usePipelineWatch(fullPath: Ref<string>) {
  // Getter key so the set re-keys when the project changes (matches useSavedViews).
  const ids = useLocalStorage<string[]>(() => storageKey(fullPath.value), [])

  const isWatched = (id: string) => ids.value.includes(id)

  function subscribe(id: string) {
    if (!ids.value.includes(id)) ids.value = [...ids.value, id]
  }

  function unwatch(id: string) {
    ids.value = ids.value.filter((x) => x !== id)
  }

  function toggle(id: string) {
    if (isWatched(id)) unwatch(id)
    else subscribe(id)
  }

  return { ids, isWatched, subscribe, unwatch, toggle }
}

export type PipelineWatch = ReturnType<typeof usePipelineWatch>
