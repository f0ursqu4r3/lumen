<script setup lang="ts">
import { X } from '@lucide/vue'
import LabelChip from '@/features/labels/components/LabelChip.vue'

defineProps<{
  labelChips: { title: string; color: string }[]
  assignee: string
  author: string
}>()
defineEmits<{
  'remove-label': [title: string]
  'clear-assignee': []
  'clear-author': []
  'clear-all': []
}>()
</script>

<template>
  <div class="relative flex flex-wrap items-center gap-2">
    <span class="text-2xs tracking-wide text-muted-foreground/60 uppercase"> Filtering </span>
    <!-- Tokens animate as a group: each springs in on add, recoils out on
         remove, and the survivors slide to close the gap (see .facet-* in
         styles.css). `contents` keeps the group transparent to the flex row. -->
    <TransitionGroup name="facet" tag="div" class="contents">
      <LabelChip
        v-for="l in labelChips"
        :key="`label:${l.title}`"
        :title="l.title"
        :color="l.color"
        closeable
        @remove="$emit('remove-label', l.title)"
      />
      <span
        v-if="assignee"
        key="facet:assignee"
        class="inline-flex items-center gap-1 rounded-full bg-muted/60 py-0.5 pr-1 pl-2 text-2xs font-medium text-foreground/80 ring-1 ring-inset ring-white/10"
      >
        <span class="font-mono">{{ assignee === '__none__' ? 'Unassigned' : '@' + assignee }}</span>
        <button
          type="button"
          aria-label="Remove assignee filter"
          class="grid size-4 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          @click="$emit('clear-assignee')"
        >
          <X class="size-3" />
        </button>
      </span>
      <span
        v-if="author"
        key="facet:author"
        class="inline-flex items-center gap-1 rounded-full bg-muted/60 py-0.5 pr-1 pl-2 text-2xs font-medium text-foreground/80 ring-1 ring-inset ring-white/10"
      >
        <span class="font-mono">author:@{{ author }}</span>
        <button
          type="button"
          aria-label="Remove author filter"
          class="grid size-4 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          @click="$emit('clear-author')"
        >
          <X class="size-3" />
        </button>
      </span>
    </TransitionGroup>
    <button
      type="button"
      class="text-2xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:underline"
      @click="$emit('clear-all')"
    >
      Clear all
    </button>
  </div>
</template>
