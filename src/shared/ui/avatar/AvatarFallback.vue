<script setup lang="ts">
import type { AvatarFallbackProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { AvatarFallback } from 'reka-ui'
import { cn } from '@/shared/lib/utils'

const props = defineProps<AvatarFallbackProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <AvatarFallback
    data-slot="avatar-fallback"
    v-bind="delegatedProps"
    :class="
      cn(
        // Initials scale to the circle: ~40% of its width keeps a two-letter
        // monogram comfortably inside the ring at any avatar size. Tight tracking
        // so wide pairs (MI, GW) don't crowd the edges.
        'bg-muted flex size-full items-center justify-center rounded-full text-[40cqi] leading-none font-medium tracking-[-0.02em]',
        props.class,
      )
    "
  >
    <slot />
  </AvatarFallback>
</template>
