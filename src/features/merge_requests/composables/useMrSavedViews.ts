import { computed, ref, watch, type Ref } from 'vue'
import { useSavedViews, type ViewSlice } from '@/shared/composables/useSavedViews'
import { MR_FILTER_KEYS } from '@/features/merge_requests/lib/mrView'

// Orchestrates the saved-views store for the merge request list: which named
// view is active for the current filter slice, whether the slice is worth
// saving, and the load/save/update/remove flow (tracking the loaded view so the
// toolbar can offer "update" once its filters drift). Persists under the 'mr'
// namespace so MR views are kept separate from issue views. Resets the loaded
// view when the project changes (the view list re-keys).
export function useMrSavedViews<Slice extends ViewSlice>(
  fullPath: Ref<string>,
  viewSlice: Ref<Slice>,
  applyView: (query: Slice) => void,
) {
  const savedViews = useSavedViews(fullPath, 'mr', MR_FILTER_KEYS)
  const activeViewId = computed(() => savedViews.activeId(viewSlice.value))
  const canSaveView = computed(() => Object.keys(viewSlice.value).length > 0)
  const loadedViewId = ref<string | null>(null)
  watch(fullPath, () => (loadedViewId.value = null))

  function loadView(view: { id: string; query: Slice }) {
    applyView(view.query)
    loadedViewId.value = view.id
  }
  function saveCurrentView(name: string) {
    loadedViewId.value = savedViews.add(name, viewSlice.value)?.id ?? null
  }
  function updateView(id: string) {
    savedViews.update(id, viewSlice.value)
  }
  function removeView(id: string) {
    savedViews.remove(id)
    if (loadedViewId.value === id) loadedViewId.value = null
  }

  return {
    savedViews,
    activeViewId,
    canSaveView,
    loadedViewId,
    loadView,
    saveCurrentView,
    updateView,
    removeView,
  }
}
