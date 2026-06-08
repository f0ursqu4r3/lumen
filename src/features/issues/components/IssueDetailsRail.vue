<script setup lang="ts">
import { computed } from 'vue'
import StatusPicker from '@/features/issues/components/StatusPicker.vue'
import LabelPicker from '@/features/labels/components/LabelPicker.vue'
import AssigneeEditor from '@/features/assignees/components/AssigneeEditor.vue'
import QuickAssign from '@/features/assignees/components/QuickAssign.vue'
import type { WorkItemStatus } from '@/features/issues/composables/useWorkItemStatus'
import type { ProjectMilestone } from '@/features/issues/composables/useProjectMilestones'
import type { IssueDetail } from '@/features/issues/composables/useIssue'
import type { ProjectMember } from '@/features/projects/composables/useProjectMembers'
import type { ProjectContributor } from '@/features/projects/composables/useProjectContributors'
import type { ProjectLabel } from '@/features/labels/composables/useProjectLabels'
import { Input } from '@/shared/ui/input'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'

const props = defineProps<{
  issue: IssueDetail
  members: ProjectMember[]
  contributors: ProjectContributor[]
  catalog: ProjectLabel[]
  statusOptions: WorkItemStatus[]
  milestones: ProjectMilestone[]
}>()

const draftLabelIds = defineModel<string[]>('labelIds', { required: true })
const draftStatusId = defineModel<string | null>('statusId', { required: true })
const draftAssignees = defineModel<string[]>('assigneeUsernames', { required: true })
const draftMilestoneId = defineModel<string | null>('milestoneId', { required: true })
const draftDueDate = defineModel<string>('dueDate', { required: true })
const draftWeight = defineModel<number | null>('weight', { required: true })
const draftConfidential = defineModel<boolean>('confidential', { required: true })
const draftTimeEstimate = defineModel<string>('timeEstimate', { required: true })

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

    <div class="flex flex-col gap-1.5">
      <span class="field-label">Milestone</span>
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
    </div>

    <div class="grid grid-cols-2 gap-3">
      <label class="flex min-w-0 flex-col gap-1.5">
        <span class="field-label">Due date</span>
        <Input v-model="draftDueDate" type="date" class="h-8 text-xs" aria-label="Due date" />
      </label>

      <label class="flex min-w-0 flex-col gap-1.5">
        <span class="field-label">Weight</span>
        <Input
          v-model="weightText"
          type="number"
          min="0"
          inputmode="numeric"
          class="h-8 text-xs"
          aria-label="Weight"
          placeholder="None"
        />
      </label>
    </div>

    <label class="flex flex-col gap-1.5">
      <span class="field-label">Estimate</span>
      <Input
        v-model="draftTimeEstimate"
        class="h-8 text-xs"
        aria-label="Time estimate"
        placeholder="e.g. 2h 30m"
      />
    </label>

    <label class="flex items-center gap-2 text-sm text-foreground">
      <Checkbox
        :checked="draftConfidential"
        aria-label="Confidential"
        @update:checked="draftConfidential = $event === true"
      />
      <span>Confidential</span>
    </label>
  </aside>
</template>
