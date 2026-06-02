<script setup lang="ts">
import { computed } from 'vue'
import { X } from '@lucide/vue'
import { parseLabel, readableText, darken, mix } from '@/lib/labels'

const props = defineProps<{
  title: string
  color: string
  closeable?: boolean
}>()
const emit = defineEmits<{ remove: [] }>()

// The dark slate surface the chip sits on (matches --card). The value fill is
// mixed toward it so saturated label colors read calm instead of neon, then the
// scope block, text, and edge are all derived from that softened fill so the
// two-tone hierarchy and contrast hold for any label color (even dark ones).
const SURFACE = '#24262c'

// GitLab supplies an arbitrary hex color. Scoped labels (`scope::value`) render
// as two-tone pills — a darker scope segment and a softened value segment —
// with text color chosen for contrast on each segment.
const parsed = computed(() => parseLabel(props.title, props.color))
const valueBg = computed(() => mix(props.color, SURFACE, 0.34))
const valueText = computed(() => readableText(valueBg.value))
const scopeBg = computed(() => darken(valueBg.value, 0.3))
const scopeText = computed(() => readableText(scopeBg.value))

// A darker shade of the softened fill makes a crisp edge + seam on the dark
// theme (better than a generic white ring, which makes every pill glow alike).
const edge = computed(() => darken(valueBg.value, 0.45))

// The close button sits on the value-colored fill, so its hover wash is tuned to
// the value's text color — never gray-on-color.
const xHover = computed(() =>
  valueText.value === '#ffffff' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)',
)
</script>

<template>
  <span
    class="inline-flex h-5 items-center overflow-hidden rounded-full text-[11px] leading-none font-medium whitespace-nowrap"
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
