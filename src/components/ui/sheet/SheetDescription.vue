<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DialogDescription, type DialogDescriptionProps, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogDescriptionProps & { class?: HTMLAttributes['class'] }>()
const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegated)
</script>

<template>
  <DialogDescription
    data-slot="sheet-description"
    v-bind="forwarded"
    :class="cn('text-muted-foreground text-sm', props.class)"
  >
    <slot />
  </DialogDescription>
</template>
