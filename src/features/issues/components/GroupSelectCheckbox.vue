<script setup lang="ts">
import { computed } from 'vue'
import { Checkbox } from '@/shared/ui/checkbox'
import { useInjectedSelection } from '@/features/issues/composables/useIssueSelection'

// A group/column header checkbox that selects or deselects every issue in the
// group at once. Self-hides unless select mode is on, so headers can render it
// unconditionally. Tri-state: none → unchecked, all → checked, a mix →
// indeterminate (rendered as a minus by the shared Checkbox).
const props = defineProps<{ iids: string[]; label?: string }>()
const selection = useInjectedSelection()

const state = computed<boolean | 'indeterminate'>(() => {
  if (!props.iids.length) return false
  const n = props.iids.reduce((acc, iid) => acc + (selection.isSelected(iid) ? 1 : 0), 0)
  if (n === 0) return false
  return n === props.iids.length ? true : 'indeterminate'
})

// 'all' → clear the group; anything else (none/some) → select the whole group.
const onToggle = () => selection.setMany(props.iids, state.value !== true)
</script>

<template>
  <Checkbox
    v-if="selection.mode.value"
    data-testid="group-select-all"
    :model-value="state"
    :aria-label="label ? `Select all in ${label}` : 'Select all in group'"
    @click.stop
    @update:model-value="onToggle"
  />
</template>
