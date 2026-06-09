<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ width?: 'default' | 'narrow' | 'wide' | 'bare' }>(), {
  width: 'default',
})

// `bare` is a passthrough for views that already sit inside an outer container
// (the popped-out window's <main>, the issue drawer) — full width, no padding.
const containerClass = computed(() => {
  if (props.width === 'bare') return 'w-full'
  const max = { default: 'max-w-5xl', narrow: 'max-w-3xl', wide: 'max-w-7xl' }[props.width]
  return `mx-auto w-full px-6 py-8 ${max}`
})
</script>

<template>
  <div :class="containerClass">
    <slot />
  </div>
</template>
