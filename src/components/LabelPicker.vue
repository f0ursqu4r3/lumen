<script setup lang="ts">
import { ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Check, Tag } from '@lucide/vue'
import LabelChip from './LabelChip.vue'
import type { ProjectLabel } from '@/composables/useProjectLabels'

const props = defineProps<{ catalog: ProjectLabel[]; modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [titles: string[]] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (open.value = false))

const selected = (title: string) => props.modelValue.includes(title)

function toggle(title: string) {
  emit(
    'update:modelValue',
    selected(title)
      ? props.modelValue.filter((t) => t !== title)
      : [...props.modelValue, title],
  )
}

const chipFor = (title: string) =>
  props.catalog.find((l) => l.title === title) ?? { title, color: '#888' }
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      data-testid="label-picker-trigger"
      class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      @click="open = !open"
    >
      <Tag class="size-3.5" />
      Labels
    </button>

    <div v-if="modelValue.length" class="mt-2 flex flex-wrap gap-1.5">
      <LabelChip
        v-for="t in modelValue"
        :key="t"
        :title="chipFor(t).title"
        :color="chipFor(t).color"
        closeable
        @remove="toggle(t)"
      />
    </div>

    <div
      v-if="open"
      class="absolute z-50 mt-1 max-h-60 w-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      <button
        v-for="l in catalog"
        :key="l.id"
        type="button"
        :data-testid="`label-option-${l.title}`"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
        @click="toggle(l.title)"
      >
        <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: l.color }" />
        <span class="flex-1 truncate text-foreground">{{ l.title }}</span>
        <Check v-if="selected(l.title)" class="size-3.5 text-primary" />
      </button>
      <p v-if="!catalog.length" class="px-2 py-1.5 text-xs text-muted-foreground">
        No labels in this project.
      </p>
    </div>
  </div>
</template>
