<script setup lang="ts">
import { computed } from 'vue'
import { X } from '@lucide/vue'
import { labelVisual } from '@/lib/labels'

const props = defineProps<{
  title: string
  color: string
  closeable?: boolean
}>()
const emit = defineEmits<{ remove: [] }>()

// GitLab supplies an arbitrary hex color. Scoped labels (`scope::value`) render
// as two-tone pills — a darker scope segment and a softened value segment, with
// text chosen for contrast on each. The whole palette is derived once and cached
// per (title, color) in labelVisual(), so the same label across hundreds of rows
// costs one computation, not one per chip instance.
const v = computed(() => labelVisual(props.title, props.color))
const parsed = computed(() => v.value.parsed)
const valueBg = computed(() => v.value.valueBg)
const valueText = computed(() => v.value.valueText)
const scopeBg = computed(() => v.value.scopeBg)
const scopeText = computed(() => v.value.scopeText)
const edge = computed(() => v.value.edge)
const xHover = computed(() => v.value.xHover)
</script>

<template>
  <span
    class="inline-flex h-5 items-center overflow-hidden rounded-full text-2xs leading-none font-medium whitespace-nowrap"
    :style="{
      backgroundColor: valueBg,
      color: valueText,
      boxShadow: `inset 0 0 0 1px ${edge}`,
      '--chip-x-hover': xHover,
    }"
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
      :class="[parsed.scope && 'border-l', closeable && 'pr-1']"
      :style="{ borderColor: edge }"
    >
      {{ parsed.value }}
    </span>
    <button
      v-if="closeable"
      type="button"
      :aria-label="`Remove filter ${title}`"
      class="mr-0.5 grid size-3.5 place-items-center rounded-full opacity-70 outline-none transition hover:bg-[var(--chip-x-hover)] hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60"
      :style="{ color: valueText }"
      @click="emit('remove')"
    >
      <X class="size-2.5" :stroke-width="2.5" />
    </button>
  </span>
</template>
