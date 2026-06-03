<script setup lang="ts">
import { Eye, Pencil } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    editing: boolean;
    label: string;
    toggleTestid?: string;
  }>(),
  { toggleTestid: "editable-toggle" },
);
const emit = defineEmits<{ "update:editing": [value: boolean] }>();
</script>

<template>
  <div
    class="space-y-1.5"
    @keydown.escape="props.editing && emit('update:editing', false)"
  >
    <div class="flex items-center justify-end">
      <button
        type="button"
        :data-testid="props.toggleTestid"
        :aria-label="(props.editing ? 'Preview ' : 'Edit ') + props.label"
        class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        @click="emit('update:editing', !props.editing)"
      >
        <component :is="props.editing ? Eye : Pencil" class="size-3.5" />
        {{ props.editing ? "Preview" : "Edit" }}
      </button>
    </div>
    <slot v-if="props.editing" name="edit" />
    <slot v-else name="view" />
  </div>
</template>
