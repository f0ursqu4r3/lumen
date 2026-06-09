<script setup lang="ts">
import { ArrowLeft, FileText, Workflow } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import { useTabNav } from '@/shared/composables/useTabNav'

defineProps<{ fullPath: string; repoName: string; count: number }>()
const { onTabNav } = useTabNav()
</script>

<template>
  <div class="flex items-end justify-between gap-4">
    <div class="min-w-0">
      <p
        class="font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
      >
        Merge Requests
      </p>
      <RouterLink
        :to="{ name: 'projects' }"
        data-testid="back-to-projects"
        class="group/back -ml-1 mt-2 flex max-w-full items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
      >
        <ArrowLeft
          class="size-5 shrink-0 text-primary transition-transform group-hover/back:-translate-x-0.5"
        />
        <h1 class="min-w-0 truncate text-title leading-none font-semibold text-foreground">
          {{ repoName }}
        </h1>
        <span
          v-if="count"
          class="shrink-0 font-mono text-sm tabular-nums text-muted-foreground/70"
          :aria-label="`${count} merge requests`"
        >
          {{ count }}
        </span>
      </RouterLink>
    </div>
    <div class="flex shrink-0 items-center gap-3">
      <Button variant="outline" as-child>
        <RouterLink
          :to="{ name: 'issues', params: { fullPath } }"
          @click="onTabNav($event, { name: 'issues', params: { fullPath } })"
        >
          <FileText /> Issues
        </RouterLink>
      </Button>
      <Button variant="outline" as-child>
        <RouterLink
          :to="{ name: 'pipelines', params: { fullPath } }"
          @click="onTabNav($event, { name: 'pipelines', params: { fullPath } })"
        >
          <Workflow /> Pipelines
        </RouterLink>
      </Button>
    </div>
  </div>
</template>
