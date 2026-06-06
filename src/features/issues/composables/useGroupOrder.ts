import { useLocalStorage } from '@vueuse/core'
import type { Ref } from 'vue'

// Per-project, per-dimension custom ordering of list groups / board columns.
// The dimension key is the grouping string the list/board already use
// ('status', 'assignee', 'label:team', 'priority'), so a single entry is shared
// across both views. Values are the ordered group keys (status ids, usernames,
// label values, priority levels, including '__none'). Local-only: these columns
// are synthetic, so GitLab has no order to persist server-side.
const storageKey = (fullPath: string) => `lumen:group-order:${fullPath}`

export function useGroupOrder(fullPath: Ref<string>) {
  // Getter key re-reads storage on project switch (mirrors useSavedViews).
  // flush: 'sync' ensures the key-change watcher runs synchronously so
  // orderFor() returns the correct project's data immediately after a
  // fullPath change (important for tests and same-tick reads).
  const stored = useLocalStorage<Record<string, string[]>>(() => storageKey(fullPath.value), {}, {
    flush: 'sync',
  })

  const orderFor = (dimension: string): string[] => stored.value[dimension] ?? []
  const hasOrder = (dimension: string): boolean => (stored.value[dimension]?.length ?? 0) > 0

  function setOrder(dimension: string, keys: string[]): void {
    if (!keys.length) {
      reset(dimension)
      return
    }
    stored.value = { ...stored.value, [dimension]: keys }
  }
  function reset(dimension: string): void {
    const next = { ...stored.value }
    delete next[dimension]
    stored.value = next
  }

  return { orderFor, hasOrder, setOrder, reset }
}
