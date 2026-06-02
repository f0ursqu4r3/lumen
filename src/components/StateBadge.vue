<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ state: string; compact?: boolean }>();
const open = computed(() => props.state === "opened");
const label = computed(() => (open.value ? "Open" : "Closed"));
</script>

<template>
  <!-- Compact: a status dot (used in dense lists where the column is implied).
       Full: a pill with a leading dot (used on the detail page). -->
  <span
    v-if="compact"
    :title="label"
    :aria-label="label"
    class="inline-block size-2 shrink-0 rounded-full"
    :class="
      open
        ? 'bg-emerald-400 shadow-[0_0_0_3px_oklch(0.7_0.15_162/0.18)]'
        : 'bg-muted-foreground/50'
    "
  />
  <span
    v-else
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
    :class="
      open
        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
        : 'border-border bg-muted text-muted-foreground'
    "
  >
    <span
      class="size-1.5 rounded-full"
      :class="open ? 'bg-emerald-400' : 'bg-muted-foreground'"
    />
    {{ label }}
  </span>
</template>
