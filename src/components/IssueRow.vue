<script setup lang="ts">
import LabelChip from './LabelChip.vue'
import StateBadge from './StateBadge.vue'
import type { IssueListItem } from '@/composables/useIssues'
defineProps<{ issue: IssueListItem; fullPath: string }>()
</script>
<template>
  <RouterLink
    :to="{ name: 'issue', params: { fullPath, iid: issue.iid } }"
    class="flex items-center gap-2 px-3 py-2 hover:bg-neutral-100"
  >
    <StateBadge :state="issue.state" />
    <span class="font-medium">#{{ issue.iid }}</span>
    <span class="truncate">{{ issue.title }}</span>
    <span class="ml-auto flex gap-1">
      <LabelChip v-for="l in (issue.labels?.nodes ?? []).filter((x): x is NonNullable<typeof x> => !!x)" :key="l.id" :title="l.title" :color="l.color" />
    </span>
  </RouterLink>
</template>
