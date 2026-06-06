<script setup lang="ts">
import { GripVertical } from '@lucide/vue'
import IssueRow from '@/features/issues/components/IssueRow.vue'
import { Card } from '@/shared/ui/card'
import type { Facet, IssueGroup } from '@/features/issues/lib/issueView'

const props = defineProps<{
  groups: IssueGroup[]
  groupKey: string
  fullPath: string
  highlightIid: string | null
  vtNameFor: (iid: string) => string | undefined
  reorderDragKey: string | null
  reorderOverKey: string | null
}>()
defineEmits<{
  filter: [f: Facet]
  'reorder-start': [key: string, e: DragEvent]
  'reorder-over': [key: string]
  'reorder-drop': [key: string]
  'reorder-end': []
}>()

// Reorder only makes sense with real, multiple groups — not the single "all"
// lane that 'none' grouping produces.
const reorderable = () => props.groupKey !== 'none' && props.groups.length > 1
</script>

<template>
  <!-- List view -->
  <TransitionGroup tag="div" name="grp" class="space-y-5">
    <section v-for="g in groups" :key="g.key" class="space-y-2">
      <header
        v-if="groupKey !== 'none'"
        class="flex items-center gap-2 rounded-md px-1 py-0.5"
        :class="[
          reorderDragKey === g.key ? 'opacity-50' : '',
          reorderOverKey === g.key && reorderDragKey !== g.key
            ? 'ring-1 ring-primary/50'
            : '',
        ]"
        @dragover.prevent="reorderable() && $emit('reorder-over', g.key)"
        @drop.prevent="reorderable() && $emit('reorder-drop', g.key)"
      >
        <span
          v-if="reorderable()"
          data-testid="group-grip"
          draggable="true"
          aria-label="Reorder group"
          class="-ml-0.5 cursor-grab text-muted-foreground/30 transition-opacity hover:text-muted-foreground/60 active:cursor-grabbing"
          @dragstart="$emit('reorder-start', g.key, $event)"
          @dragend="$emit('reorder-end')"
        >
          <GripVertical class="size-3.5" />
        </span>
        <span v-if="g.color" class="size-2 rounded-full" :style="{ backgroundColor: g.color }" />
        <h2 class="text-sm font-medium text-foreground">{{ g.label }}</h2>
        <span class="font-mono text-xs tabular-nums text-muted-foreground/60">
          {{ g.issues.length }}
        </span>
      </header>
      <Card class="gap-0 divide-y divide-border/60 overflow-hidden p-0 shadow-pop">
        <IssueRow
          v-for="(issue, i) in g.issues"
          :key="issue.iid"
          :issue="issue"
          :full-path="fullPath"
          :index="i"
          :highlight="issue.iid === highlightIid"
          :vt-name="vtNameFor(issue.iid)"
          @filter="$emit('filter', $event)"
        />
      </Card>
    </section>
  </TransitionGroup>
</template>

<style scoped>
/* FLIP the sections into place when their order changes. */
.grp-move {
  transition: transform 200ms ease;
}
</style>
