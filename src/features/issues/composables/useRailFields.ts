import { computed, ref, type Ref } from 'vue'
import type { IssueDraft } from '@/features/issues/lib/issueEdit'
import {
  RAIL_FIELDS,
  railField,
  visibleFieldKeys,
  hiddenFieldList,
  type RailFieldDescriptor,
  type RailFieldKey,
} from '@/features/issues/lib/railFields'

const PINNED_KEYS = new Set(RAIL_FIELDS.filter((f) => f.pinned).map((f) => f.key))

/**
 * Owns the transient per-session reveal/removal intent for the Details Rail and
 * derives which fields are visible vs. available in the Add menu. `revealed` and
 * `removed` never persist — they are cleared by `resetReveal()` on save/cancel.
 *
 * @param draft - Must be a deep reactive `Ref<IssueDraft | null>` (as produced by
 *   `useIssueDraft`), not a `shallowRef`. `remove()` clears a field by mutating the
 *   draft object in place, relying on deep reactivity to propagate the change.
 * @param original - The unmodified baseline draft for deriving default visibility.
 */
export function useRailFields(draft: Ref<IssueDraft | null>, original: Ref<IssueDraft | null>) {
  const revealed = ref(new Set<RailFieldKey>())
  const removed = ref(new Set<RailFieldKey>())

  const visibleKeys = computed<Set<RailFieldKey>>(() => {
    const d = draft.value
    const o = original.value
    if (!d || !o) return new Set(PINNED_KEYS)
    return visibleFieldKeys(d, o, revealed.value, removed.value)
  })

  const hiddenFields = computed<RailFieldDescriptor[]>(() => {
    const d = draft.value
    const o = original.value
    if (!d || !o) return []
    return hiddenFieldList(d, o, revealed.value, removed.value)
  })

  function reveal(key: RailFieldKey) {
    if (removed.value.has(key)) {
      const r = new Set(removed.value)
      r.delete(key)
      removed.value = r
    }
    const v = new Set(revealed.value)
    v.add(key)
    revealed.value = v
  }

  function remove(key: RailFieldKey) {
    if (draft.value) railField(key).clear(draft.value)
    const v = new Set(revealed.value)
    v.delete(key)
    revealed.value = v
    const r = new Set(removed.value)
    r.add(key)
    removed.value = r
  }

  function resetReveal() {
    if (revealed.value.size) revealed.value = new Set()
    if (removed.value.size) removed.value = new Set()
  }

  return { visibleKeys, hiddenFields, reveal, remove, resetReveal }
}
