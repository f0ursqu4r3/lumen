<script setup lang="ts">
import { ref, computed } from 'vue'
import { Tag, UserPlus, ExternalLink, X, CheckCheck } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import LabelPicker from '@/components/LabelPicker.vue'
import AssigneePicker from '@/components/AssigneePicker.vue'
import StatusPicker from '@/components/StatusPicker.vue'
import type { ProjectLabel } from '@/composables/useProjectLabels'
import type { ProjectMember } from '@/composables/useProjectMembers'
import type { WorkItemStatus } from '@/composables/useWorkItemStatus'

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

// --- Labels popover (titles <-> ids via catalog) ----------------------------
const labelsOpen = ref(false)
const pendingTitles = ref<string[]>([])
const labelMode = ref<'add' | 'remove'>('add')
const titleToId = computed(() => new Map(props.catalog.map((l) => [l.title, l.id])))
function applyLabels() {
  const ids = pendingTitles.value
    .map((t) => titleToId.value.get(t))
    .filter((id): id is string => !!id)
  if (!ids.length) return
  if (labelMode.value === 'add') emit('add-labels', ids)
  else emit('remove-labels', ids)
  pendingTitles.value = []
  labelsOpen.value = false
}

// --- Assignee popover -------------------------------------------------------
const assigneeOpen = ref(false)
const pendingAssignee = ref<string | null>(null)
function applyAssignee() {
  const username = props.members.find((m) => m.id === pendingAssignee.value)?.username ?? null
  emit('set-assignee', { username })
  pendingAssignee.value = null
  assigneeOpen.value = false
}

function toggleLabels() {
  if (labelsOpen.value) pendingTitles.value = []
  labelsOpen.value = !labelsOpen.value
}

function toggleAssignee() {
  if (assigneeOpen.value) pendingAssignee.value = null
  assigneeOpen.value = !assigneeOpen.value
}

// --- Status (StatusPicker emits immediately on select) ----------------------
function onSelectStatus(status: WorkItemStatus) {
  emit('set-status', status)
}
</script>

<template>
  <Transition name="bulk-bar">
    <div
      v-if="count > 0"
      data-testid="bulk-action-bar"
      class="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-pop backdrop-blur"
    >
      <span class="px-1 font-mono text-xs font-medium tabular-nums text-foreground" aria-live="polite">
        {{ count }} selected
      </span>
      <span class="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

      <!-- Labels -->
      <div class="relative">
        <Button variant="ghost" size="sm" data-testid="bulk-labels" @click="toggleLabels">
          <Tag /> Labels
        </Button>
        <!-- v1: popovers close via their trigger button or Apply, not outside-click -->
        <div
          v-if="labelsOpen"
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
              :class="labelMode === 'remove' ? 'bg-card text-foreground' : 'text-muted-foreground'"
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
        <Button variant="ghost" size="sm" data-testid="bulk-assign" @click="toggleAssignee">
          <UserPlus /> Assign
        </Button>
        <div
          v-if="assigneeOpen"
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

      <!-- Status (applies on pick) -->
      <StatusPicker
        v-if="statuses.length"
        :statuses="statuses"
        :current="null"
        label="Status"
        @select="onSelectStatus"
      />

      <span class="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

      <Button variant="ghost" size="sm" data-testid="bulk-open-combined" @click="emit('open-combined')">
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
</template>

<style scoped>
.bulk-bar-enter-active,
.bulk-bar-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}
.bulk-bar-enter-from,
.bulk-bar-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
