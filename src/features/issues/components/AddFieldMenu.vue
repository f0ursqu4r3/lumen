<script setup lang="ts">
import { ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Plus } from '@lucide/vue'
import type { RailFieldDescriptor, RailFieldKey } from '@/features/issues/lib/railFields'

defineProps<{ fields: RailFieldDescriptor[] }>()
const emit = defineEmits<{ add: [key: RailFieldKey] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (open.value = false))

function choose(key: RailFieldKey) {
  emit('add', key)
  open.value = false
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      data-testid="add-field-trigger"
      class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      @click="open = !open"
    >
      <Plus class="size-3.5" />
      Add field
    </button>
    <div
      v-if="open"
      class="absolute left-0 z-10 mt-1 min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <button
        v-for="f in fields"
        :key="f.key"
        type="button"
        :data-testid="`add-field-${f.key}`"
        class="flex w-full items-center rounded px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
        @click="choose(f.key)"
      >
        {{ f.addLabel ?? f.label }}
      </button>
    </div>
  </div>
</template>
