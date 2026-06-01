<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { Plus } from '@lucide/vue'
import { useIssues } from '@/composables/useIssues'
import { useCreateIssue } from '@/composables/useIssueMutations'
import type { IssueFilters } from '@/gitlab/issueParams'
import IssueRow from '@/components/IssueRow.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const props = defineProps<{ fullPath: string }>()

// Raw text inputs; mapped into IssueFilters (labels is comma-separated).
const state = ref<IssueFilters['state']>('opened')
const search = ref('')
const labelsText = ref('')
const assignee = ref('')
const milestone = ref('')

const filters = computed<IssueFilters>(() => ({
  state: state.value,
  search: search.value || undefined,
  labels: labelsText.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  assignee: assignee.value || undefined,
  milestone: milestone.value || undefined,
}))

const { data, isLoading, error } = useIssues(toRef(props, 'fullPath'), filters)
const createIssue = useCreateIssue(props.fullPath)
const newTitle = ref('')
function submitNew() {
  if (!newTitle.value.trim()) return
  createIssue.mutate({ title: newTitle.value }, { onSuccess: () => (newTitle.value = '') })
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-lg font-semibold">Issues — {{ fullPath }}</h1>

    <div class="flex flex-wrap items-center gap-2">
      <Select v-model="state">
        <SelectTrigger class="w-[120px]">
          <SelectValue placeholder="State" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="opened">Open</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
          <SelectItem value="all">All</SelectItem>
        </SelectContent>
      </Select>
      <Input v-model="search" type="search" placeholder="Search issues…" class="flex-1" />
      <Input v-model="labelsText" placeholder="Labels (comma-separated)" class="w-48" />
      <Input v-model="assignee" placeholder="Assignee username" class="w-44" />
      <Input v-model="milestone" placeholder="Milestone" class="w-36" />
    </div>

    <form class="flex gap-2" @submit.prevent="submitNew">
      <Input v-model="newTitle" placeholder="New issue title…" class="flex-1" />
      <Button type="submit" :disabled="createIssue.isPending.value">
        <Plus />
        Create
      </Button>
    </form>

    <ErrorNotice v-if="createIssue.error.value" :error="createIssue.error.value" />
    <ErrorNotice v-if="error" :error="error" />
    <div v-else-if="isLoading" class="space-y-2">
      <Skeleton v-for="i in 5" :key="i" class="h-12 w-full" />
    </div>
    <template v-else>
      <Card v-if="data?.nodes.length" class="divide-y py-0">
        <IssueRow v-for="issue in data.nodes" :key="issue.iid" :issue="issue" :full-path="fullPath" />
      </Card>
      <p v-else class="text-sm text-muted-foreground">No issues.</p>
    </template>
  </section>
</template>
