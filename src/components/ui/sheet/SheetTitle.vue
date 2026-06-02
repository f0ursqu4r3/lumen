<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { DialogTitle, type DialogTitleProps, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  DialogTitleProps & { class?: HTMLAttributes["class"] }
>();
const delegated = reactiveOmit(props, "class");
const forwarded = useForwardProps(delegated);
</script>

<template>
  <DialogTitle
    data-slot="sheet-title"
    v-bind="forwarded"
    :class="cn('text-foreground font-semibold', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
