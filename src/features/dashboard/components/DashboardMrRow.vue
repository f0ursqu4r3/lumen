<script setup lang="ts">
import { computed } from 'vue'
import { GitMerge } from '@lucide/vue'
import MrStateBadge from '@/features/merge_requests/components/MrStateBadge.vue'
import { type DashboardMr } from '@/features/dashboard/lib/dashboard'
import { timeAgo } from '@/shared/lib/time'

const props = defineProps<{ mr: DashboardMr }>()
const updated = computed(() => timeAgo(props.mr.updatedAt))
</script>

<template>
  <RouterLink
    :to="{ name: 'merge-request', params: { fullPath: mr.project.fullPath, iid: mr.iid } }"
    class="flex items-center gap-3 rounded-md px-3 py-2.5 outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring/50"
  >
    <GitMerge class="size-4 shrink-0 text-muted-foreground" />
    <div class="min-w-0 flex-1">
      <span class="truncate text-sm font-medium text-foreground">{{ mr.title }}</span>
      <div class="mt-0.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span class="truncate">{{ mr.project.fullPath }}</span>
        <span>!{{ mr.iid }}</span>
      </div>
    </div>
    <MrStateBadge :state="mr.state" :draft="mr.draft" class="shrink-0" />
    <span class="hidden shrink-0 text-xs text-muted-foreground sm:inline">{{ updated }}</span>
  </RouterLink>
</template>
