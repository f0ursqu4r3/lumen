<script setup lang="ts">
import { computed } from 'vue'
import StatusPicker from '@/features/issues/components/StatusPicker.vue'
import LabelPicker from '@/features/labels/components/LabelPicker.vue'
import AssigneeEditor from '@/features/assignees/components/AssigneeEditor.vue'
import QuickAssign from '@/features/assignees/components/QuickAssign.vue'
import type { WorkItemStatus } from '@/features/issues/composables/useWorkItemStatus'
import type { IssueDetail } from '@/features/issues/composables/useIssue'
import type { ProjectMember } from '@/features/projects/composables/useProjectMembers'
import type { ProjectContributor } from '@/features/projects/composables/useProjectContributors'
import type { ProjectLabel } from '@/features/labels/composables/useProjectLabels'

const props = defineProps<{
  issue: IssueDetail
  members: ProjectMember[]
  contributors: ProjectContributor[]
  catalog: ProjectLabel[]
  statusOptions: WorkItemStatus[]
}>()

const draftLabelIds = defineModel<string[]>('labelIds', { required: true })
const draftStatusId = defineModel<string | null>('statusId', { required: true })
const draftAssignees = defineModel<string[]>('assigneeUsernames', { required: true })

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
</script>

<template>
  <aside
    class="issue__meta animate-row-in space-y-5 rounded-xl border border-border bg-card/55 p-4 shadow-card"
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

    <div class="space-y-1.5">
      <span class="field-label">Milestone</span>
      <p class="text-sm" :class="issue.milestone ? 'text-foreground' : 'text-muted-foreground'">
        {{ issue.milestone?.title ?? 'None' }}
      </p>
    </div>
  </aside>
</template>
