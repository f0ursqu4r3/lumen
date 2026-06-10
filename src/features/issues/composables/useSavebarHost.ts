import { computed, onMounted, onUnmounted, ref } from 'vue'

// Ref-counted presence of an #issue-savebar-slot host frame (the issue sheet or
// the popped-out window). IssueDetail docks its save/revert bar into the slot
// while a host is mounted; with none it renders the bar in place. A reactive
// counter (not a one-shot DOM probe) avoids racing the slot's own mount.
const hostCount = ref(0)

export const savebarHostPresent = computed(() => hostCount.value > 0)

// Called by the slot component so its lifetime drives the flag.
export function useSavebarHostMarker() {
  onMounted(() => hostCount.value++)
  onUnmounted(() => hostCount.value--)
}
