<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Tags } from '@lucide/vue'
import LabelChip from './LabelChip.vue'
import LabelGroupMenu from './LabelGroupMenu.vue'
import { groupLabelsByScope, toggleScoped } from '@/lib/labelGroups'
import type { ProjectLabel } from '@/composables/useProjectLabels'

const props = withDefaults(
  defineProps<{ catalog: ProjectLabel[]; modelValue: string[]; label?: string }>(),
  { label: 'Labels' },
)
const emit = defineEmits<{ 'update:modelValue': [titles: string[]] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (open.value = false))

const groups = computed(() => groupLabelsByScope(props.catalog))
function onToggle(title: string) {
  emit('update:modelValue', toggleScoped(props.modelValue, title))
}

const chipFor = (title: string) =>
  props.catalog.find((l) => l.title === title) ?? { title, color: '#888' }
</script>

<template>
  <div ref="root">
    <div class="flex items-center justify-between gap-2">
      <span class="field-label">{{ label }}</span>
      <div class="relative">
        <button
          type="button"
          data-testid="label-picker-trigger"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          @click="open = !open"
        >
          <Tags class="size-3.5" />
          Labels
        </button>

        <div
          v-if="open"
          class="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-border bg-popover p-1 shadow-md"
        >
          <LabelGroupMenu :groups="groups" :selected="modelValue" @toggle="onToggle" />
        </div>
      </div>
    </div>

    <div v-if="modelValue.length" class="mt-2 flex flex-wrap gap-1.5">
      <LabelChip
        v-for="t in modelValue"
        :key="t"
        :title="chipFor(t).title"
        :color="chipFor(t).color"
        closeable
        @remove="onToggle(t)"
      />
    </div>
  </div>
</template>
