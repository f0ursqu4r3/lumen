<script setup lang="ts">
import { computed, toRef } from 'vue'
import { FileText, GitMerge, Workflow } from '@lucide/vue'
import { useTabNav } from '@/shared/composables/useTabNav'
import { usePipelines } from '@/features/pipelines/composables/usePipelines'
import { isActivePipeline } from '@/gitlab/pipelineParams'

const props = defineProps<{ fullPath: string; active: string }>()
const { onTabNav } = useTabNav()

const { pipelines } = usePipelines(toRef(props, 'fullPath'))
const running = computed(() => pipelines.value.filter((p) => isActivePipeline(p.status)).length)

const TABS = [
  { name: 'issues', label: 'Issues', icon: FileText },
  { name: 'merge-requests', label: 'MRs', icon: GitMerge },
  { name: 'pipelines', label: 'Pipelines', icon: Workflow },
] as const

// A bottom border on the link itself (rather than an absolutely-positioned
// span) gives a stable underline under the label, independent of the bar height.
const tabClass = (name: string) =>
  [
    'flex items-center gap-1.5 rounded-t-md border-b-2 px-2 py-1 text-sm outline-none transition-colors',
    name === props.active
      ? 'border-primary text-foreground'
      : 'border-transparent text-muted-foreground hover:text-foreground',
  ].join(' ')
</script>

<template>
  <nav class="flex items-center gap-1" aria-label="Project sections">
    <RouterLink
      v-for="tab in TABS"
      :key="tab.name"
      :to="{ name: tab.name, params: { fullPath } }"
      :aria-current="tab.name === active ? 'page' : undefined"
      :class="tabClass(tab.name)"
      @click="onTabNav($event, { name: tab.name, params: { fullPath } })"
    >
      <component :is="tab.icon" class="size-4" />
      {{ tab.label }}
      <span
        v-if="tab.name === 'pipelines' && running > 0"
        data-testid="tab-pipelines-running"
        class="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-sky-300"
        :title="`${running} active`"
      >
        <span class="size-1.5 animate-pulse rounded-full bg-sky-400" />
        {{ running }}
      </span>
    </RouterLink>
  </nav>
</template>
