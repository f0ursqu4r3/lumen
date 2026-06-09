<script setup lang="ts">
import { useCurrentUser } from '@/features/dashboard/composables/useCurrentUser'
import { useAssignedIssues } from '@/features/dashboard/composables/useAssignedIssues'
import { useAssignedMergeRequests } from '@/features/dashboard/composables/useAssignedMergeRequests'
import { useReviewRequestedMergeRequests } from '@/features/dashboard/composables/useReviewRequestedMergeRequests'
import DashboardLane from '@/features/dashboard/components/DashboardLane.vue'
import DashboardIssueRow from '@/features/dashboard/components/DashboardIssueRow.vue'
import DashboardMrRow from '@/features/dashboard/components/DashboardMrRow.vue'

import { computed } from 'vue'

const { data: username, isPending: userPending } = useCurrentUser()
const assignedIssues = useAssignedIssues(username)
const assignedMrs = useAssignedMergeRequests()
const reviewMrs = useReviewRequestedMergeRequests()

// While the username is still resolving, the assigned-issues query is disabled
// (so its own isLoading is false). Treat that as loading so the lane shows a
// skeleton instead of flashing "nothing assigned" on cold start.
const issuesLoading = computed(() => userPending.value || assignedIssues.isLoading.value)
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-6 py-8">
    <header class="mb-8 flex items-end justify-between">
      <h1 class="text-title font-semibold text-foreground">My Work</h1>
      <RouterLink
        :to="{ name: 'projects' }"
        class="text-sm text-muted-foreground hover:text-foreground"
      >
        Projects →
      </RouterLink>
    </header>

    <div class="space-y-8">
      <DashboardLane
        title="Assigned Issues"
        :count="assignedIssues.issues.value.length"
        :is-loading="issuesLoading"
        :error="assignedIssues.error.value"
        :is-empty="!assignedIssues.issues.value.length"
        :has-more="assignedIssues.hasMore.value"
        empty-message="Nothing assigned to you."
      >
        <li v-for="issue in assignedIssues.issues.value" :key="issue.iid">
          <DashboardIssueRow :issue="issue" />
        </li>
      </DashboardLane>

      <DashboardLane
        title="Assigned MRs"
        :count="assignedMrs.mrs.value.length"
        :is-loading="assignedMrs.isLoading.value"
        :error="assignedMrs.error.value"
        :is-empty="!assignedMrs.mrs.value.length"
        :has-more="assignedMrs.hasMore.value"
        empty-message="No MRs assigned."
      >
        <li v-for="mr in assignedMrs.mrs.value" :key="mr.iid">
          <DashboardMrRow :mr="mr" />
        </li>
      </DashboardLane>

      <DashboardLane
        title="Awaiting My Review"
        :count="reviewMrs.mrs.value.length"
        :is-loading="reviewMrs.isLoading.value"
        :error="reviewMrs.error.value"
        :is-empty="!reviewMrs.mrs.value.length"
        :has-more="reviewMrs.hasMore.value"
        empty-message="No reviews requested — you're clear."
      >
        <li v-for="mr in reviewMrs.mrs.value" :key="mr.iid">
          <DashboardMrRow :mr="mr" />
        </li>
      </DashboardLane>
    </div>
  </div>
</template>
