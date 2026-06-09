<script setup lang="ts">
import { computed } from 'vue'
import { GitMerge, ArrowRight } from '@lucide/vue'
import MrStateBadge from '@/features/merge_requests/components/MrStateBadge.vue'
import type { MergeRequestListItem } from '@/features/merge_requests/composables/useMergeRequests'

const props = defineProps<{ mr: MergeRequestListItem; fullPath: string }>()

const reviewers = computed(
  () =>
    props.mr.reviewers?.nodes?.filter(
      (n): n is { name?: string | null; username: string } => !!n,
    ) ?? [],
)
const approvals = computed(() =>
  props.mr.approvalsRequired
    ? `${props.mr.approved ? '✓ ' : ''}${props.mr.approvalsRequired} approvals`
    : null,
)
</script>

<template>
  <RouterLink
    :to="{ name: 'merge-request', params: { fullPath, iid: mr.iid } }"
    class="flex items-center gap-3 rounded-md px-3 py-2.5 outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring/50"
  >
    <GitMerge class="size-4 shrink-0 text-muted-foreground" />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="truncate text-sm font-medium text-foreground">{{ mr.title }}</span>
        <MrStateBadge :state="mr.state" :draft="mr.draft" />
      </div>
      <div class="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <span class="font-medium">!{{ mr.iid }}</span>
        <span class="truncate">{{ mr.sourceBranch }}</span>
        <ArrowRight class="size-3 shrink-0" />
        <span class="truncate">{{ mr.targetBranch }}</span>
      </div>
    </div>
    <div class="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex">
      <span v-if="approvals">{{ approvals }}</span>
      <span v-if="reviewers.length"
        >{{ reviewers.length }} reviewer{{ reviewers.length > 1 ? 's' : '' }}</span
      >
    </div>
  </RouterLink>
</template>
