<script setup lang="ts">
import { computed } from 'vue'
import { GitBranch, TriangleAlert } from '@lucide/vue'
import PipelineStatusBadge from '@/features/pipelines/components/PipelineStatusBadge.vue'

type UserCore = { name?: string | null; username: string }
const props = defineProps<{
  mr: {
    sourceBranch: string
    targetBranch: string
    approved: boolean
    approvalsRequired?: number | null
    conflicts: boolean
    mergeableDiscussionsState?: boolean | null
    reviewers?: { nodes?: (UserCore | null)[] | null } | null
    assignees?: { nodes?: (UserCore | null)[] | null } | null
    labels?: { nodes?: ({ id: string; title: string; color: string } | null)[] | null } | null
    milestone?: { id: string; title: string } | null
    headPipeline?: { id: string; status: string } | null
  }
}>()

const reviewers = computed(() => props.mr.reviewers?.nodes?.filter((n): n is UserCore => !!n) ?? [])
const assignees = computed(() => props.mr.assignees?.nodes?.filter((n): n is UserCore => !!n) ?? [])
const labels = computed(
  () =>
    props.mr.labels?.nodes?.filter((n): n is { id: string; title: string; color: string } => !!n) ??
    [],
)
const nameOf = (u: UserCore) => u.name || u.username
</script>

<template>
  <aside class="space-y-5 text-sm">
    <section>
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">Branches</h3>
      <div class="flex items-center gap-1.5 font-mono text-xs">
        <GitBranch class="size-3.5 text-muted-foreground" />
        <span class="truncate">{{ mr.sourceBranch }}</span>
        <span class="text-muted-foreground">→</span>
        <span class="truncate">{{ mr.targetBranch }}</span>
      </div>
    </section>

    <section v-if="mr.approvalsRequired">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">
        Approvals
      </h3>
      <p>{{ mr.approved ? 'Approved' : 'Not approved' }} · {{ mr.approvalsRequired }} required</p>
    </section>

    <section v-if="reviewers.length">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">
        Reviewers
      </h3>
      <ul>
        <li v-for="r in reviewers" :key="r.username">{{ nameOf(r) }}</li>
      </ul>
    </section>

    <section v-if="assignees.length">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">
        Assignees
      </h3>
      <ul>
        <li v-for="a in assignees" :key="a.username">{{ nameOf(a) }}</li>
      </ul>
    </section>

    <section v-if="labels.length">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">Labels</h3>
      <div class="flex flex-wrap gap-1">
        <span
          v-for="l in labels"
          :key="l.id"
          class="rounded px-1.5 py-0.5 text-xs ring-1 ring-inset ring-border"
          >{{ l.title }}</span
        >
      </div>
    </section>

    <section v-if="mr.milestone">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">
        Milestone
      </h3>
      <p>{{ mr.milestone.title }}</p>
    </section>

    <section v-if="mr.headPipeline">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">Pipeline</h3>
      <PipelineStatusBadge :status="mr.headPipeline.status" />
    </section>

    <p v-if="mr.conflicts" class="flex items-center gap-1.5 text-xs text-rose-300">
      <TriangleAlert class="size-3.5" /> Has conflicts
    </p>
    <p
      v-if="mr.mergeableDiscussionsState === false"
      class="flex items-center gap-1.5 text-xs text-amber-300"
    >
      <TriangleAlert class="size-3.5" /> Unresolved discussions
    </p>
  </aside>
</template>
