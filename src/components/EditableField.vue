<script setup lang="ts">
import { Eye, Pencil } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    editing: boolean
    label: string
    toggleTestid?: string
  }>(),
  { toggleTestid: 'editable-toggle' },
)
const emit = defineEmits<{ 'update:editing': [value: boolean] }>()

// Escape leaves edit mode. Stop propagation only while editing so the keystroke
// doesn't also bubble to an enclosing dialog/drawer and close it; a non-editing
// Escape is left to bubble (e.g. to close the drawer).
function onEscape(e: KeyboardEvent) {
  if (!props.editing) return
  e.stopPropagation()
  emit('update:editing', false)
}
</script>

<template>
  <div class="space-y-1.5" @keydown.escape="onEscape">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-muted-foreground">
        {{ props.label }}
      </span>
      <button
        type="button"
        :data-testid="props.toggleTestid"
        :aria-label="(props.editing ? 'Preview ' : 'Edit ') + props.label"
        class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        @click="emit('update:editing', !props.editing)"
      >
        <component :is="props.editing ? Eye : Pencil" class="size-3.5" />
        {{ props.editing ? 'Preview' : 'Edit' }}
      </button>
    </div>
    <slot v-if="props.editing" name="edit" />
    <slot v-else name="view" />
  </div>
</template>
