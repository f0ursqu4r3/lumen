<script setup lang="ts">
withDefaults(defineProps<{ width?: 'default' | 'narrow' | 'wide' }>(), { width: 'default' })
</script>

<template>
  <div
    class="mx-auto w-full px-6 py-8"
    :class="{
      'max-w-3xl': width === 'narrow',
      'max-w-5xl': width === 'default',
      'max-w-7xl': width === 'wide',
    }"
  >
    <slot />
  </div>
</template>
