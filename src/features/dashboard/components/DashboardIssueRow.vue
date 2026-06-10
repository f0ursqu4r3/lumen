<script setup lang="ts">
import { computed } from 'vue'
import { FileText } from '@lucide/vue'
import StateBadge from '@/features/issues/components/StateBadge.vue'
import { parseIssuePath, type DashboardIssue } from '@/features/dashboard/lib/dashboard'
import { timeAgo } from '@/shared/lib/time'

const props = defineProps<{ issue: DashboardIssue }>()

const parsed = computed(() => parseIssuePath(props.issue.webPath))
const updated = computed(() => timeAgo(props.issue.updatedAt))

const rowClass =
  'flex items-center gap-3 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-accent/70 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50'
</script>

<template>
  <!-- Open the issue in its project's list with the drawer (issue sheet) up,
       mirroring how a row click works inside the list itself — rather than
       dropping onto the bare full-page detail. -->
  <RouterLink
    v-if="parsed"
    :to="{ name: 'issues', params: { fullPath: parsed.fullPath }, query: { issue: issue.iid } }"
    :class="rowClass"
  >
    <FileText class="size-4 shrink-0 text-muted-foreground" />
    <div class="min-w-0 flex-1">
      <span class="truncate text-sm font-medium text-foreground">{{ issue.title }}</span>
      <div class="mt-0.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span class="truncate">{{ parsed.fullPath }}</span>
        <span>#{{ issue.iid }}</span>
      </div>
    </div>
    <StateBadge :state="issue.state" class="shrink-0" />
    <span class="hidden shrink-0 text-xs text-muted-foreground sm:inline">{{ updated }}</span>
  </RouterLink>
  <a v-else :href="issue.webUrl" target="_blank" rel="noopener" :class="rowClass">
    <FileText class="size-4 shrink-0 text-muted-foreground" />
    <div class="min-w-0 flex-1">
      <span class="truncate text-sm font-medium text-foreground">{{ issue.title }}</span>
      <div class="mt-0.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span class="truncate">{{ issue.webPath }}</span>
        <span>#{{ issue.iid }}</span>
      </div>
    </div>
    <StateBadge :state="issue.state" class="shrink-0" />
    <span class="hidden shrink-0 text-xs text-muted-foreground sm:inline">{{ updated }}</span>
  </a>
</template>
