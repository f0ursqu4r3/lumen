<script setup lang="ts">
import { computed } from 'vue'
import { Stepper, StepperItem, StepperSeparator, StepperTitle } from '@/components/ui/stepper'
import { statusMeta, isActivePipeline } from '@/gitlab/pipelineParams'
import { TONE_VISUALS } from '@/components/pipelineTone'
import type { PipelineStage } from '@/composables/usePipelines'

const props = defineProps<{ stages: PipelineStage[] }>()

// GitLab reports stage status as a lowercase string ("running"); our metadata is
// keyed by the uppercase enum, so normalize before lookup.
const norm = (s: string) => s.toUpperCase()
const visual = (s: PipelineStage) => TONE_VISUALS[statusMeta(norm(s.status)).tone]
const label = (s: PipelineStage) => statusMeta(norm(s.status)).label

// Drive the connecting track: the first in-flight stage is the "active" step, so
// everything before it reads as completed. If nothing is in flight the pipeline
// is done — point past the last step so the whole track fills.
const activeStep = computed(() => {
  const idx = props.stages.findIndex((s) => isActivePipeline(norm(s.status)))
  return idx === -1 ? props.stages.length + 1 : idx + 1
})
</script>

<template>
  <Stepper
    v-if="stages.length"
    :model-value="activeStep"
    class="w-full items-start overflow-x-auto px-0.5 py-1"
  >
    <StepperItem
      v-for="(stage, i) in stages"
      :key="stage.id"
      :step="i + 1"
      class="relative flex w-full min-w-16 flex-col items-center text-center"
    >
      <!-- Custom indicator: coloured by the stage's own status rather than the
           linear stepper state, so a failed/running stage shows true. -->
      <span
        class="z-10 flex size-8 items-center justify-center rounded-full"
        :class="visual(stage).indicator"
        :title="`${stage.name} · ${label(stage)}`"
      >
        <component
          :is="visual(stage).icon"
          class="size-4"
          :class="visual(stage).spin ? 'animate-spin' : ''"
        />
      </span>
      <StepperSeparator
        v-if="i < stages.length - 1"
        class="absolute top-4 left-[calc(50%+1.25rem)] right-[calc(-50%+1.25rem)] h-0.5 rounded-full"
      />
      <StepperTitle
        class="mt-2 max-w-20 truncate text-2xs font-medium text-muted-foreground"
      >
        {{ stage.name }}
      </StepperTitle>
    </StepperItem>
  </Stepper>
</template>
