<script setup lang="ts">
import { statusMeta } from '@/gitlab/pipelineParams'
import { TONE_VISUALS } from '@/features/pipelines/lib/pipelineTone'
import type { PipelineStage } from '@/features/pipelines/composables/usePipelines'

// The collapsed-row glance: each stage as a small status dot joined by hairline
// connectors — the stepper distilled to one line, no labels. Stage name + status
// live in each dot's tooltip. Shares TONE_VISUALS with the full stepper so a
// running/failed dot matches its expanded indicator.
defineProps<{ stages: PipelineStage[] }>()

const norm = (s: string) => s.toUpperCase()
const dot = (s: PipelineStage) => TONE_VISUALS[statusMeta(norm(s.status)).tone].dot
const label = (s: PipelineStage) => statusMeta(norm(s.status)).label
</script>

<template>
  <div class="flex items-center" role="list" :aria-label="`${stages.length} stages`">
    <template v-for="(s, i) in stages" :key="s.id">
      <span
        role="listitem"
        class="size-2 shrink-0 rounded-full"
        :class="dot(s)"
        :title="`${s.name} · ${label(s)}`"
        :aria-label="`${s.name}: ${label(s)}`"
      />
      <span v-if="i < stages.length - 1" class="h-px w-2.5 shrink-0 bg-border" aria-hidden="true" />
    </template>
  </div>
</template>
