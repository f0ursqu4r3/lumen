import { ref } from 'vue'
import { reorderKeys } from '@/features/issues/lib/issueView'

// A dedicated drag type so a group/column reorder is never mistaken for a card
// drag (card DnD uses 'text/plain'); the board's card drop/dragover handlers
// already no-op when no card is in hand, so the two coexist.
const REORDER_MIME = 'application/x-lumen-group'

interface OrderStore {
  setOrder: (dimension: string, keys: string[]) => void
}

/**
 * Drives grip-handle reordering of list groups / board columns. The component
 * supplies the live displayed key order on drop; we compute the new sequence
 * (see reorderKeys) and persist it via the store.
 */
export function useGroupReorder(store: OrderStore) {
  const dragKey = ref<string | null>(null)
  const overKey = ref<string | null>(null)

  function onReorderStart(key: string, e: DragEvent) {
    dragKey.value = key
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData(REORDER_MIME, key)
    }
  }
  function onReorderOver(key: string) {
    if (dragKey.value && key !== dragKey.value) overKey.value = key
  }
  function onReorderDrop(dimension: string, displayedKeys: string[]) {
    const from = dragKey.value
    const to = overKey.value
    clearReorder()
    if (!from || !to) return
    store.setOrder(dimension, reorderKeys(displayedKeys, from, to))
  }
  function clearReorder() {
    dragKey.value = null
    overKey.value = null
  }
  const isReorderTarget = (key: string): boolean =>
    !!dragKey.value && overKey.value === key && key !== dragKey.value

  return {
    dragKey,
    overKey,
    onReorderStart,
    onReorderOver,
    onReorderDrop,
    clearReorder,
    isReorderTarget,
  }
}
