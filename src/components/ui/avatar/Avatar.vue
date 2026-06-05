<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { AvatarRoot } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <AvatarRoot
    data-slot="avatar"
    :class="
      cn(
        // A query container so the fallback initials can size themselves to the
        // circle (see AvatarFallback) — two-letter monograms then fit any diameter.
        'relative flex size-8 shrink-0 overflow-hidden rounded-full [container-type:inline-size]',
        props.class,
      )
    "
  >
    <slot />
  </AvatarRoot>
</template>
