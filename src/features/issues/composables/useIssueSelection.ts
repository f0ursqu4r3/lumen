import { ref, computed, watch, inject, type Ref, type ComputedRef, type InjectionKey } from 'vue'

export interface IssueSelection {
  /** Select-mode on/off. When off, checkboxes are hidden and clicks navigate. */
  mode: Ref<boolean>
  /** The selected issue iids. */
  selected: Ref<Set<string>>
  count: ComputedRef<number>
  isSelected: (iid: string) => boolean
  toggle: (iid: string) => void
  /** Add or remove a batch of iids at once, leaving the rest of the selection
   *  untouched — used by group/column "select all" headers. */
  setMany: (iids: string[], on: boolean) => void
  selectAll: (iids: string[]) => void
  clear: () => void
  /** Clear the selection and turn mode off. */
  exit: () => void
  /** Set mode; turning it off clears the selection. */
  setMode: (on: boolean) => void
}

export const IssueSelectionKey: InjectionKey<IssueSelection> = Symbol('issue-selection')

export function useIssueSelection(fullPath: Ref<string>): IssueSelection {
  const mode = ref(false)
  const selected = ref<Set<string>>(new Set())
  const count = computed(() => selected.value.size)

  // A different project means a different issue set — drop selection + mode.
  watch(fullPath, () => {
    selected.value = new Set()
    mode.value = false
  })

  const isSelected = (iid: string) => selected.value.has(iid)
  function toggle(iid: string) {
    const next = new Set(selected.value)
    if (next.has(iid)) next.delete(iid)
    else next.add(iid)
    selected.value = next
  }
  function setMany(iids: string[], on: boolean) {
    const next = new Set(selected.value)
    for (const iid of iids) {
      if (on) next.add(iid)
      else next.delete(iid)
    }
    selected.value = next
  }
  const selectAll = (iids: string[]) => (selected.value = new Set(iids))
  const clear = () => (selected.value = new Set())
  const exit = () => {
    selected.value = new Set()
    mode.value = false
  }
  const setMode = (on: boolean) => {
    mode.value = on
    if (!on) selected.value = new Set()
  }

  return { mode, selected, count, isSelected, toggle, setMany, selectAll, clear, exit, setMode }
}

// A no-op selection used when a row/card renders without a provider (isolated
// tests, or any future host that doesn't opt into selection). Mode is always
// off, so the consuming component behaves exactly as it did before selection.
const DISABLED_SELECTION: IssueSelection = {
  mode: ref(false),
  selected: ref(new Set<string>()),
  count: computed(() => 0),
  isSelected: () => false,
  toggle: () => {},
  setMany: () => {},
  selectAll: () => {},
  clear: () => {},
  exit: () => {},
  setMode: () => {},
}

export function useInjectedSelection(): IssueSelection {
  // inject() returns undefined when called outside a component setup context
  // (e.g., in tests without a provider). Fall back to the disabled singleton.
  return inject(IssueSelectionKey, DISABLED_SELECTION) ?? DISABLED_SELECTION
}
