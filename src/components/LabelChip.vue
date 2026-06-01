<script setup lang="ts">
import { computed } from 'vue'
import { parseLabel, readableText, darken } from '@/lib/labels'

const props = defineProps<{ title: string; color: string }>()

// GitLab supplies an arbitrary hex color. Scoped labels (`scope::value`) render
// as two-tone pills — a darker scope segment and a value segment in the label
// color — with text color chosen for contrast on each segment.
const parsed = computed(() => parseLabel(props.title, props.color))
const valueText = computed(() => readableText(props.color))
const scopeBg = computed(() => darken(props.color, 0.34))
const scopeText = computed(() => readableText(scopeBg.value))
</script>

<template>
  <span
    class="inline-flex h-5 items-center overflow-hidden rounded-full text-[11px] font-medium leading-none whitespace-nowrap ring-1 ring-inset ring-white/8"
    :title="title"
  >
    <span
      v-if="parsed.scope"
      class="flex h-full items-center px-1.5 font-semibold tracking-tight"
      :style="{ backgroundColor: scopeBg, color: scopeText }"
    >
      {{ parsed.scope }}
    </span>
    <span
      class="flex h-full items-center px-1.5"
      :style="{ backgroundColor: color, color: valueText }"
    >
      {{ parsed.value }}
    </span>
  </span>
</template>
