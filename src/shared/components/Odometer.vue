<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'

// A rolling-digit readout for the hero counts. Where `.animate-count` faded the
// whole number on change, this resolves it digit by digit — each column rolls to
// its new glyph, rightmost first, the way a mechanical counter settles. The roll
// direction tracks the value (up when it grows, down when it shrinks), so a
// filter narrowing 47 → 12 reads as the instrument counting *down* to the
// answer. Inherits font, size, weight and color from its host; honours reduced
// motion by snapping instantly.

const props = defineProps<{ value: number }>()

const motion = usePreferredReducedMotion()
const reduce = computed(() => motion.value === 'reduce')

// Direction is decided the instant the value changes, before the new digits
// render, so the entering glyphs slide in from the correct side.
const direction = ref<'up' | 'down'>('up')
watch(
  () => props.value,
  (next, prev) => {
    if (next !== prev) direction.value = next >= prev ? 'up' : 'down'
  },
)

const transitionName = computed(() => `odo-${direction.value}`)

// Cells are keyed by position-from-right so the units column is stable as the
// number gains or loses digits — only the glyph inside a cell swaps, and only
// that cell's roll animates.
const cells = computed(() => {
  const digits = Math.trunc(Math.abs(props.value)).toString().split('')
  const len = digits.length
  return digits.map((char, i) => {
    const pos = len - 1 - i
    return { pos, char, delay: Math.min(pos, 5) * 16 }
  })
})
</script>

<template>
  <span class="odo" aria-hidden="true">
    <span
      v-for="cell in cells"
      :key="cell.pos"
      class="odo__cell"
      :style="{ '--odo-delay': `${cell.delay}ms` }"
    >
      <Transition :name="transitionName" :css="!reduce">
        <span :key="cell.char" class="odo__digit">{{ cell.char }}</span>
      </Transition>
    </span>
  </span>
  <!-- The plain value stays available to assistive tech and tests. -->
  <span class="sr-only">{{ props.value }}</span>
</template>

<style scoped>
.odo {
  display: inline-flex;
  font: inherit;
  color: inherit;
  font-variant-numeric: tabular-nums;
  letter-spacing: inherit;
  /* The hero scale sets line-height 0.85; the per-cell overflow clip needs a full
     em line box or it would crop the digit, so pin leading to 1 locally. The
     adjacent "+" still aligns, since baseline alignment ignores box height. */
  line-height: 1;
}

.odo__cell {
  position: relative;
  display: inline-block;
  overflow: hidden;
  text-align: center;
}

.odo__digit {
  display: inline-block;
  will-change: transform;
}

/* The leaving glyph drops out of flow so the cell is sized by the arriving one —
   no width or height wobble while a column rolls. */
.odo :deep(.odo-up-leave-active),
.odo :deep(.odo-down-leave-active) {
  position: absolute;
  inset: 0;
}

.odo :deep(.odo-up-enter-active),
.odo :deep(.odo-up-leave-active),
.odo :deep(.odo-down-enter-active),
.odo :deep(.odo-down-leave-active) {
  transition:
    transform 0.26s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.26s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--odo-delay, 0ms);
}

/* Rolling up (count grew): the new digit rises into place, the old lifts away. */
.odo :deep(.odo-up-enter-from) {
  transform: translateY(70%);
  opacity: 0;
}
.odo :deep(.odo-up-leave-to) {
  transform: translateY(-70%);
  opacity: 0;
}

/* Rolling down (count shrank): the new digit settles from above. */
.odo :deep(.odo-down-enter-from) {
  transform: translateY(-70%);
  opacity: 0;
}
.odo :deep(.odo-down-leave-to) {
  transform: translateY(70%);
  opacity: 0;
}
</style>
