<script setup lang="ts">
import { computed } from 'vue'
import { statusMeta } from '@/gitlab/pipelineParams'
import { TONE_VISUALS } from '@/features/pipelines/lib/pipelineTone'

const props = defineProps<{ status: string; compact?: boolean }>()

const meta = computed(() => statusMeta(props.status))
const tone = computed(() => TONE_VISUALS[meta.value.tone])
</script>

<template>
  <!-- Compact: a status dot for dense rows. The running tone pulses so an
       in-flight pipeline reads as "live" at a glance. -->
  <span
    v-if="compact"
    :title="meta.label"
    :aria-label="meta.label"
    class="inline-block size-2 shrink-0 rounded-full"
    :class="[tone.dot, tone.spin ? 'animate-pulse' : '']"
  />
  <span
    v-else
    class="inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-0.5 font-mono text-2xs font-medium tracking-[0.06em] uppercase"
    :class="tone.pill"
  >
    <component :is="tone.icon" class="size-3.5" :class="tone.spin ? 'animate-spin' : ''" />
    {{ meta.label }}
  </span>
</template>
