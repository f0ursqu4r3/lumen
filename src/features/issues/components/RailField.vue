<script setup lang="ts">
import { X } from '@lucide/vue'

defineProps<{ label: string; removable?: boolean }>()
defineEmits<{ remove: [] }>()
</script>

<template>
  <!-- Fallthrough attrs (e.g. data-field) land here on the single root; the rail uses data-field to focus this field after reveal. -->
  <div class="group flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2">
      <span class="field-label">{{ label }}</span>
      <button
        v-if="removable"
        type="button"
        data-testid="rail-field-remove"
        :aria-label="`Remove ${label}`"
        class="opacity-0 text-muted-foreground outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        @click="$emit('remove')"
      >
        <X class="size-3.5" />
      </button>
    </div>
    <slot />
  </div>
</template>
