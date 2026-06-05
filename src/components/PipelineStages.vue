<script setup lang="ts">
import { statusMeta } from '@/gitlab/pipelineParams'
import { TONE_VISUALS } from '@/components/pipelineTone'
import type { PipelineStage, PipelineJob } from '@/composables/usePipelines'

defineProps<{ stages: PipelineStage[] }>()

// GitLab reports status as a lowercase string ("running"); our metadata is keyed
// by the uppercase enum, so normalize before lookup.
const norm = (s: string) => s.toUpperCase()
const visual = (status: string) => TONE_VISUALS[statusMeta(norm(status)).tone]
const label = (status: string) => statusMeta(norm(status)).label
const jobTitle = (j: PipelineJob) => `${j.name} · ${label(j.status)}`
</script>

<template>
  <!-- The run's stages laid out left-to-right as the CI flow, each card holding
       its own jobs. Horizontally scrollable so a wide pipeline never reflows the
       row; connectors between cards trace the stage order. -->
  <div v-if="stages.length" class="flex items-start overflow-x-auto px-0.5 py-1">
    <template v-for="(stage, i) in stages" :key="stage.id">
      <div
        class="shrink-0 rounded-lg border border-border/70 bg-background/40 p-3 min-w-44 max-w-64"
      >
        <h4 class="truncate text-sm font-semibold text-foreground" :title="stage.name">
          {{ stage.name }}
        </h4>
        <ul v-if="stage.jobs.length" class="mt-2.5 space-y-1.5">
          <li v-for="job in stage.jobs" :key="job.id" class="flex items-center gap-2">
            <!-- Same ringed-indicator idiom as the collapsed-row stepper, sized
                 down for the job line. Coloured by the job's own status. -->
            <span
              class="flex size-5 shrink-0 items-center justify-center rounded-full"
              :class="visual(job.status).indicator"
              :title="jobTitle(job)"
            >
              <component
                :is="visual(job.status).icon"
                class="size-3"
                :class="visual(job.status).spin ? 'animate-spin' : ''"
              />
            </span>
            <span class="truncate text-sm text-muted-foreground" :title="job.name">
              {{ job.name }}
            </span>
          </li>
        </ul>
        <!-- A stage with no jobs (rare) still shows its name; flag the gap quietly
             rather than rendering an empty card. -->
        <p v-else class="mt-2.5 text-xs text-muted-foreground/60">No jobs</p>
      </div>

      <!-- Connector aligned to the stage-header band (card pt-3 + half the title
           row) so it reads as a through-line regardless of job count. -->
      <div
        v-if="i < stages.length - 1"
        class="mt-[1.625rem] h-px w-6 shrink-0 self-start bg-border"
        aria-hidden="true"
      />
    </template>
  </div>
</template>
