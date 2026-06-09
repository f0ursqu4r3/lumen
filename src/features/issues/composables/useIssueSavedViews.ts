import { computed, ref, watch, type Ref } from 'vue'
import { useSavedViews } from '@/shared/composables/useSavedViews'
import { FILTER_KEYS, type ViewSlice } from '@/features/issues/composables/useIssueFilters'

// Orchestrates the saved-views store for the issue list: which named view is
// active for the current filter slice, whether the slice is worth saving, and
// the load/save/update/remove flow (tracking the loaded view so the toolbar can
// offer "update" once its filters drift). Resets the loaded view when the
// project changes (the view list re-keys).
export function useIssueSavedViews<Slice extends ViewSlice>(
  fullPath: Ref<string>,
  viewSlice: Ref<Slice>,
  applyView: (query: Slice) => void,
) {
  const savedViews = useSavedViews(fullPath, 'issue', FILTER_KEYS)
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
