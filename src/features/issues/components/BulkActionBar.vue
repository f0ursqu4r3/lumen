<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Tag, UserPlus, CircleDot, ExternalLink, X, CheckCheck } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import LabelPicker from '@/features/labels/components/LabelPicker.vue'
import AssigneePicker from '@/features/assignees/components/AssigneePicker.vue'
import type { ProjectLabel } from '@/features/labels/composables/useProjectLabels'
import type { ProjectMember } from '@/features/projects/composables/useProjectMembers'
import type { WorkItemStatus } from '@/features/issues/composables/useWorkItemStatus'

const props = defineProps<{
  count: number
  catalog: ProjectLabel[]
  members: ProjectMember[]
  statuses: WorkItemStatus[]
}>()

const emit = defineEmits<{
  'add-labels': [labelIds: string[]]
  'remove-labels': [labelIds: string[]]
  'set-assignee': [payload: { username: string | null }]
  'set-status': [status: WorkItemStatus]
  'open-combined': []
  'select-all': []
  clear: []
}>()

// One menu open at a time (mutual exclusion). Clicking outside the bar — or
// clearing the selection — closes whatever is open and drops its pending picks.
type Menu = 'labels' | 'assignee' | 'status'
const openMenu = ref<Menu | null>(null)
const barRoot = ref<HTMLElement | null>(null)
onClickOutside(barRoot, () => closeMenu())
watch(
  () => props.count,
  (c) => {
    if (c === 0) closeMenu()
  },
)

const pendingTitles = ref<string[]>([])
const labelMode = ref<'add' | 'remove'>('add')
const pendingAssignee = ref<string | null>(null)
const titleToId = computed(() => new Map(props.catalog.map((l) => [l.title, l.id])))

function closeMenu() {
  openMenu.value = null
  pendingTitles.value = []
  pendingAssignee.value = null
}
function toggleMenu(m: Menu) {
  if (openMenu.value === m) {
    closeMenu()
    return
  }
  // Switching menus drops the prior menu's pending picks.
  pendingTitles.value = []
  pendingAssignee.value = null
  openMenu.value = m
}

function applyLabels() {
  const ids = pendingTitles.value
    .map((t) => titleToId.value.get(t))
    .filter((id): id is string => !!id)
  if (!ids.length) return
  if (labelMode.value === 'add') emit('add-labels', ids)
  else emit('remove-labels', ids)
  closeMenu()
}

function applyAssignee() {
  const username = props.members.find((m) => m.id === pendingAssignee.value)?.username ?? null
  emit('set-assignee', { username })
  closeMenu()
}

function pickStatus(status: WorkItemStatus) {
  emit('set-status', status)
  closeMenu()
}
</script>

<template>
  <!-- Rendered at <body> so the fixed bottom bar (and its upward menus) float at
       the viewport level, clear of the app shell's overflow/stacking context. -->
  <Teleport to="body">
    <Transition name="bulk-bar">
      <div
        v-if="count > 0"
        ref="barRoot"
        data-testid="bulk-action-bar"
        class="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-pop backdrop-blur"
      >
        <span
          class="px-1 font-mono text-xs font-medium tabular-nums text-foreground"
          aria-live="polite"
        >
          {{ count }} selected
        </span>
        <span class="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

        <!-- Labels -->
        <div class="relative">
          <Button variant="ghost" size="sm" data-testid="bulk-labels" @click="toggleMenu('labels')">
            <Tag /> Labels
          </Button>
          <div
            v-if="openMenu === 'labels'"
            class="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-border bg-popover p-2 shadow-pop"
          >
            <div class="mb-2 inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                class="rounded px-2 py-0.5"
                :class="labelMode === 'add' ? 'bg-card text-foreground' : 'text-muted-foreground'"
                @click="labelMode = 'add'"
              >
                Add
              </button>
              <button
                type="button"
                class="rounded px-2 py-0.5"
                :class="
                  labelMode === 'remove' ? 'bg-card text-foreground' : 'text-muted-foreground'
                "
                @click="labelMode = 'remove'"
              >
                Remove
              </button>
            </div>
            <LabelPicker v-model="pendingTitles" :catalog="catalog" label="Labels" />
            <Button
              class="mt-2 w-full"
              size="sm"
              data-testid="bulk-apply-labels"
              :aria-label="`${labelMode === 'add' ? 'Add labels to' : 'Remove labels from'} ${count} issues`"
              @click="applyLabels"
            >
              {{ labelMode === 'add' ? 'Add to' : 'Remove from' }} {{ count }}
            </Button>
          </div>
        </div>

        <!-- Assign -->
        <div class="relative">
          <Button
            variant="ghost"
            size="sm"
            data-testid="bulk-assign"
            @click="toggleMenu('assignee')"
          >
            <UserPlus /> Assign
          </Button>
          <div
            v-if="openMenu === 'assignee'"
            class="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-border bg-popover p-2 shadow-pop"
          >
            <AssigneePicker v-model="pendingAssignee" :members="members" label="Assignee" />
            <Button
              class="mt-2 w-full"
              size="sm"
              data-testid="bulk-apply-assignee"
              :aria-label="`Assign ${count} issues`"
              @click="applyAssignee"
            >
              Assign {{ count }}
            </Button>
          </div>
        </div>

        <!-- Status: a ghost trigger matching Labels/Assign, opening an upward popover
           (the bar is bottom-anchored, so a downward menu would clip off-screen). -->
        <div v-if="statuses.length" class="relative">
          <Button variant="ghost" size="sm" data-testid="bulk-status" @click="toggleMenu('status')">
            <CircleDot /> Status
          </Button>
          <div
            v-if="openMenu === 'status'"
            data-testid="bulk-status-panel"
            class="absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-border bg-popover p-1 shadow-pop"
          >
            <ul class="max-h-64 overflow-y-auto">
              <li v-for="s in statuses" :key="s.id">
                <button
                  type="button"
                  :data-testid="`bulk-status-opt-${s.name}`"
                  class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                  @click="pickStatus(s)"
                >
                  <span
                    class="size-2.5 shrink-0 rounded-full"
                    :style="{ backgroundColor: s.color }"
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ s.name }}</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        <span class="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

        <Button
          variant="ghost"
          size="sm"
          data-testid="bulk-open-combined"
          @click="emit('open-combined')"
        >
          <ExternalLink /> Open combined
        </Button>
        <Button variant="ghost" size="sm" data-testid="bulk-select-all" @click="emit('select-all')">
          <CheckCheck /> Select all
        </Button>
        <Button variant="ghost" size="sm" data-testid="bulk-clear" @click="emit('clear')">
          <X /> Clear
        </Button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* The bar is bottom-anchored (fixed bottom-5, centered via mx-auto so the
   animated transform stays purely vertical), so it enters like a sheet rising
   straight up from the bottom-center. Enter uses a strong iOS-drawer ease-out;
   exit is snappier (the system responding, not arriving). */
.bulk-bar-enter-active {
  transition:
    opacity 260ms ease-out,
    transform 300ms cubic-bezier(0.32, 0.72, 0, 1);
}
.bulk-bar-leave-active {
  transition:
    opacity 160ms ease-out,
    transform 200ms cubic-bezier(0.32, 0.72, 0, 1);
}
.bulk-bar-enter-from,
.bulk-bar-leave-to {
  opacity: 0;
  /* Down by its own height + the bottom-5 gap → starts just below the viewport
     edge and slides straight up into place. Purely vertical: horizontal
     centering is handled by mx-auto, not by this transform. */
  transform: translateY(calc(100% + 1.25rem));
}

@media (prefers-reduced-motion: reduce) {
  .bulk-bar-enter-active,
  .bulk-bar-leave-active {
    transition: opacity 160ms ease;
  }
  .bulk-bar-enter-from,
  .bulk-bar-leave-to {
    transform: none;
  }
}
</style>
