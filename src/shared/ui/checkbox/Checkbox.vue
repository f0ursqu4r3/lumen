<script setup lang="ts">
import type { CheckboxRootProps, CheckboxRootEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { CheckboxRoot, CheckboxIndicator, useForwardPropsEmits } from 'reka-ui'
import { reactiveOmit } from '@vueuse/core'
import { Check } from '@lucide/vue'
import { cn } from '@/shared/lib/utils'

const props = defineProps<CheckboxRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<CheckboxRootEmits>()

const delegated = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <CheckboxRoot
    data-slot="checkbox"
    v-bind="forwarded"
    :class="
      cn(
        'peer size-4 shrink-0 rounded-[4px] border border-input bg-card/40 outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring/60',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        props.class,
      )
    "
  >
    <CheckboxIndicator class="grid size-full place-items-center text-current">
      <Check class="size-3" :stroke-width="3" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
