<!-- src/features/issues/components/IssueDetailsRail.vue -->
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import StatusPicker from '@/features/issues/components/StatusPicker.vue'
import LabelPicker from '@/features/labels/components/LabelPicker.vue'
import AssigneeEditor from '@/features/assignees/components/AssigneeEditor.vue'
import QuickAssign from '@/features/assignees/components/QuickAssign.vue'
import RailField from '@/features/issues/components/RailField.vue'
import AddFieldMenu from '@/features/issues/components/AddFieldMenu.vue'
import type { WorkItemStatus } from '@/features/issues/composables/useWorkItemStatus'
import type { ProjectMilestone } from '@/features/issues/composables/useProjectMilestones'
import type { IssueDetail } from '@/features/issues/composables/useIssue'
import type { ProjectMember } from '@/features/projects/composables/useProjectMembers'
import type { ProjectContributor } from '@/features/projects/composables/useProjectContributors'
import type { ProjectLabel } from '@/features/labels/composables/useProjectLabels'
import type { RailFieldDescriptor, RailFieldKey } from '@/features/issues/lib/railFields'
import { Input } from '@/shared/ui/input'
import { Checkbox } from '@/shared/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

const props = defineProps<{
  issue: IssueDetail
  members: ProjectMember[]
  contributors: ProjectContributor[]
  catalog: ProjectLabel[]
  statusOptions: WorkItemStatus[]
  milestones: ProjectMilestone[]
  visibleKeys: Set<RailFieldKey>
  hiddenFields: RailFieldDescriptor[]
}>()
const emit = defineEmits<{ add: [key: RailFieldKey]; remove: [key: RailFieldKey] }>()

const draftLabelIds = defineModel<string[]>('labelIds', { required: true })
const draftStatusId = defineModel<string | null>('statusId', { required: true })
const draftAssignees = defineModel<string[]>('assigneeUsernames', { required: true })
const draftMilestoneId = defineModel<string | null>('milestoneId', { required: true })
const draftDueDate = defineModel<string>('dueDate', { required: true })
const draftWeight = defineModel<number | null>('weight', { required: true })
const draftConfidential = defineModel<boolean>('confidential', { required: true })
const draftTimeEstimate = defineModel<string>('timeEstimate', { required: true })

const root = ref<HTMLElement | null>(null)

// Reveal is owned by the parent (it holds the draft); we relay the intent and
// then move focus to the freshly shown field's first control.
function onAdd(key: RailFieldKey) {
  emit('add', key)
  nextTick(() => {
    const el = root.value?.querySelector<HTMLElement>(
      `[data-field="${key}"] input, [data-field="${key}"] [role="combobox"], [data-field="${key}"] button`,
    )
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  })
}

// Label id<->title conversion (moved from IssueDetail), now over the catalog prop + the labelIds model.
const draftLabelTitles = computed<string[]>({
  get: () =>
    draftLabelIds.value
      .map((id) => props.catalog.find((l) => l.id === id)?.title)
      .filter((t): t is string => !!t),
  set: (titles) => {
    draftLabelIds.value = titles
      .map((t) => props.catalog.find((l) => l.title === t)?.id)
      .filter((id): id is string => !!id)
  },
})

const currentStatus = computed<WorkItemStatus | null>(
  () => props.statusOptions.find((s) => s.id === draftStatusId.value) ?? null,
)
function onSelectStatus(status: WorkItemStatus) {
  draftStatusId.value = status.id
}

const milestoneValue = computed({
  get: () => draftMilestoneId.value ?? '__none',
  set: (value: string) => {
    draftMilestoneId.value = value === '__none' ? null : value
  },
})

const milestoneOptions = computed(() => {
  const current = props.issue.milestone
  if (!current || props.milestones.some((m) => m.id === current.id)) return props.milestones
  return [{ id: current.id, title: current.title, dueDate: null }, ...props.milestones]
})

const weightText = computed({
  get: () => (draftWeight.value == null ? '' : String(draftWeight.value)),
  set: (value: string) => {
    const trimmed = value.trim()
    draftWeight.value = trimmed === '' ? null : Math.max(0, Number.parseInt(trimmed, 10) || 0)
  },
})
</script>

<template>
  <aside
    ref="root"
    class="issue__meta flex animate-row-in flex-col gap-6 border-y border-border py-6"
    style="animation-delay: 90ms"
  >
    <StatusPicker
      v-if="statusOptions.length"
      :statuses="statusOptions"
      :current="currentStatus"
      label="Status"
      @select="onSelectStatus"
    />

    <LabelPicker v-model="draftLabelTitles" :catalog="catalog" label="Labels" />

    <AssigneeEditor
      v-model:usernames="draftAssignees"
      :issue="issue"
      :members="members"
      :contributors="contributors"
      label="Assignees"
    >
      <template #actions>
        <QuickAssign
          v-model:usernames="draftAssignees"
          :issue="issue"
          :members="members"
          :contributors="contributors"
        />
      </template>
    </AssigneeEditor>

    <RailField
      v-if="visibleKeys.has('milestone')"
      data-field="milestone"
      label="Milestone"
      removable
      @remove="emit('remove', 'milestone')"
    >
      <Select v-model="milestoneValue">
        <SelectTrigger class="h-8 w-full text-xs" aria-label="Milestone">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">None</SelectItem>
          <SelectItem v-for="m in milestoneOptions" :key="m.id" :value="m.id">
            {{ m.title }}
          </SelectItem>
        </SelectContent>
      </Select>
    </RailField>

    <RailField
      v-if="visibleKeys.has('dueDate')"
      data-field="dueDate"
      label="Due date"
      removable
      @remove="emit('remove', 'dueDate')"
    >
      <Input v-model="draftDueDate" type="date" class="h-8 text-xs" aria-label="Due date" />
    </RailField>

    <RailField
      v-if="visibleKeys.has('weight')"
      data-field="weight"
      label="Weight"
      removable
      @remove="emit('remove', 'weight')"
    >
      <Input
        v-model="weightText"
        type="number"
        min="0"
        inputmode="numeric"
        class="h-8 text-xs"
        aria-label="Weight"
        placeholder="None"
      />
    </RailField>

    <RailField
      v-if="visibleKeys.has('estimate')"
      data-field="estimate"
      label="Estimate"
      removable
      @remove="emit('remove', 'estimate')"
    >
      <Input
        v-model="draftTimeEstimate"
        class="h-8 text-xs"
        aria-label="Time estimate"
        placeholder="e.g. 2h 30m"
      />
    </RailField>

    <RailField
      v-if="visibleKeys.has('confidential')"
      data-field="confidential"
      label="Confidential"
      removable
      @remove="emit('remove', 'confidential')"
    >
      <label class="flex items-center gap-2 text-sm text-foreground">
        <Checkbox
          :checked="draftConfidential"
          aria-label="Confidential"
          @update:checked="draftConfidential = $event === true"
        />
        <span>Confidential</span>
      </label>
    </RailField>

    <AddFieldMenu v-if="hiddenFields.length" :fields="hiddenFields" @add="onAdd" />
  </aside>
</template>
