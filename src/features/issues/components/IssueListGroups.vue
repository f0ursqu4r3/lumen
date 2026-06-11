<script setup lang="ts">
import { computed, ref } from 'vue'
import { GripVertical } from '@lucide/vue'
import IssueRow from '@/features/issues/components/IssueRow.vue'
import GroupSelectCheckbox from '@/features/issues/components/GroupSelectCheckbox.vue'
import ReorderGhost from '@/features/issues/components/ReorderGhost.vue'
import { Card } from '@/shared/ui/card'
import type { Facet, IssueGroup } from '@/features/issues/lib/issueView'
import type { ReorderContext } from '@/features/issues/composables/useGroupReorder'

const props = defineProps<{
  groups: IssueGroup[]
  groupKey: string
  fullPath: string
  highlightIid: string | null
  vtNameFor: (iid: string) => string | undefined
  // reorder (pointer-driven)
  activeKey: string | null
  barOffset: number | null
  pointer: { x: number; y: number } | null
  justReordered: string | null
  dimension: string
  start: (key: string, e: PointerEvent, ctx: ReorderContext) => void
}>()
defineEmits<{ filter: [f: Facet] }>()

// Reorder only makes sense with real, multiple groups — not the single "all"
// lane that 'none' grouping produces.
const reorderable = () => props.groupKey !== 'none' && props.groups.length > 1

const reorderContainer = ref<HTMLElement | null>(null)
function onGripDown(key: string, e: PointerEvent) {
  if (!reorderContainer.value) return
  props.start(key, e, {
    container: reorderContainer.value,
    axis: 'y',
    dimension: props.dimension,
    keys: props.groups.map((g) => g.key),
  })
}
const activeGroup = computed(() => props.groups.find((g) => g.key === props.activeKey) ?? null)
</script>

<template>
  <!-- List view; the wrapper is the reorder geometry container (sections carry
       data-reorder-key; the horizontal insertion line is positioned within). -->
  <div ref="reorderContainer" class="relative">
    <div
      v-if="activeKey && barOffset != null"
      data-testid="reorder-bar"
      aria-hidden="true"
      class="pointer-events-none absolute right-0 left-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]"
      :style="{ top: `${barOffset}px` }"
    />
    <TransitionGroup tag="div" name="grp" class="space-y-5">
      <section v-for="g in groups" :key="g.key" :data-reorder-key="g.key" class="space-y-2">
        <header
          v-if="groupKey !== 'none'"
          class="group/grp flex items-center gap-2 rounded-md px-1 py-0.5 transition-[box-shadow,opacity,transform] duration-150 motion-reduce:transition-none"
          :class="[
            activeKey === g.key ? 'scale-[.99] opacity-50 motion-reduce:scale-100' : '',
            justReordered === g.key ? 'reorder-settle' : '',
          ]"
        >
          <span
            v-if="reorderable()"
            data-testid="group-grip"
            aria-label="Reorder group"
            class="-ml-0.5 touch-none cursor-grab text-muted-foreground/30 transition-opacity hover:text-muted-foreground/60 active:cursor-grabbing"
            :class="activeKey ? 'opacity-100' : 'opacity-0 group-hover/grp:opacity-100'"
            @pointerdown.prevent="onGripDown(g.key, $event)"
          >
            <GripVertical class="size-3.5" />
          </span>
          <GroupSelectCheckbox :iids="g.issues.map((i) => i.iid)" :label="g.label" />
          <span v-if="g.color" class="size-2 rounded-full" :style="{ backgroundColor: g.color }" />
          <h2 class="text-sm font-medium text-foreground">{{ g.label }}</h2>
          <span class="font-mono text-xs tabular-nums text-muted-foreground/60">
            {{ g.issues.length }}
          </span>
        </header>
        <Card class="gap-0 divide-y divide-border/60 overflow-hidden p-0">
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

    <ReorderGhost
      v-if="activeGroup && pointer"
      :label="activeGroup.label"
      :color="activeGroup.color"
      :count="activeGroup.issues.length"
      :x="pointer.x"
      :y="pointer.y"
    />
  </div>
</template>

<style scoped>
/* FLIP the sections into place when their order changes. */
.grp-move {
  transition: transform 200ms ease;
}
.reorder-settle {
  animation: reorder-settle 360ms ease;
}
@keyframes reorder-settle {
  0% {
    transform: scale(0.97);
  }
  60% {
    transform: scale(1.01);
  }
  100% {
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .reorder-settle {
    animation: none;
  }
}
</style>
