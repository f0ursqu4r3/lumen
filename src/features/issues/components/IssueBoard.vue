<script setup lang="ts">
import { computed, ref } from 'vue'
import { useElementBounding } from '@vueuse/core'
import { GripVertical } from '@lucide/vue'
import IssueCard from '@/features/issues/components/IssueCard.vue'
import ReorderGhost from '@/features/issues/components/ReorderGhost.vue'
import type { IssueListItem } from '@/features/issues/composables/useIssues'
import type { IssueGroup, Facet } from '@/features/issues/lib/issueView'
import type { ReorderContext } from '@/features/issues/composables/useGroupReorder'

const props = defineProps<{
  boardGroups: IssueGroup[]
  fullPath: string
  highlightIid: string | null
  selectMode: boolean
  draggingIid: string | null
  justDropped: string | null
  dragging: IssueListItem | null
  vtNameFor: (iid: string) => string | undefined
  isDropTarget: (g: IssueGroup) => boolean
  ghostIndex: (g: IssueGroup) => number
  // reorder (pointer-driven)
  activeKey: string | null
  barOffset: number | null
  pointer: { x: number; y: number } | null
  justReordered: string | null
  dimension: string
  start: (key: string, e: PointerEvent, ctx: ReorderContext) => void
}>()
const emit = defineEmits<{
  filter: [f: Facet]
  'drag-start': [issue: IssueListItem, e: DragEvent]
  'drag-end': []
  drop: [g: IssueGroup]
  'drag-over': [key: string]
}>()

const reorderable = () => props.boardGroups.length > 1

// The scroll container doubles as the reorder geometry container: sections carry
// data-reorder-key, and the insertion bar is positioned within it.
const reorderContainer = ref<HTMLElement | null>(null)
function onGripDown(key: string, e: PointerEvent) {
  if (!reorderContainer.value) return
  props.start(key, e, {
    container: reorderContainer.value,
    axis: 'x',
    dimension: props.dimension,
    keys: props.boardGroups.map((g) => g.key),
  })
}
// The column being dragged, for the cursor ghost chip.
const activeGroup = computed(() => props.boardGroups.find((g) => g.key === props.activeKey) ?? null)

// board sizing — owns the sentinel it measures (moved from the view)
const boardTopEl = ref<HTMLElement | null>(null)
const { top: boardTop } = useElementBounding(boardTopEl)
const boardStyle = computed(() => ({
  height: `calc(100dvh - ${Math.max(0, Math.round(boardTop.value))}px)`,
}))
</script>

<template>
  <!-- Board view: full-bleed, bounded height, columns scroll on their own; the
       container is also the reorder geometry/scroll container. -->
  <div
    ref="reorderContainer"
    :style="boardStyle"
    class="relative left-1/2 -mb-6 w-screen -translate-x-1/2 overflow-x-auto pb-4"
  >
    <span ref="boardTopEl" aria-hidden="true" class="absolute top-0 left-0 h-0 w-0" />

    <!-- Insertion bar: a vertical primary bar at the gap where the dragged
         column lands. barOffset is in container content coords, so it scrolls
         with the columns. -->
    <div
      v-if="activeKey && barOffset != null"
      data-testid="reorder-bar"
      aria-hidden="true"
      class="pointer-events-none absolute top-0 bottom-4 z-10 w-0.5 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]"
      :style="{ left: `${barOffset}px` }"
    />

    <TransitionGroup tag="div" name="col" class="mx-auto flex h-full min-h-80 w-max gap-3 px-6">
      <section
        v-for="g in boardGroups"
        :key="g.key"
        :data-reorder-key="g.key"
        class="group/col relative flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl ring-1 ring-inset outline outline-offset-2 outline-transparent transition-[background-color,box-shadow,outline-color,transform,opacity] duration-150 motion-reduce:transition-none"
        :class="[
          isDropTarget(g)
            ? 'bg-primary/12 shadow-pop ring-primary/55 outline-primary/45'
            : 'bg-card/55 shadow-card ring-border/70',
          activeKey === g.key ? 'scale-[.98] opacity-50 motion-reduce:scale-100' : '',
          justReordered === g.key ? 'reorder-settle' : '',
        ]"
        @dragover.prevent="emit('drag-over', g.key)"
        @dragenter.prevent="emit('drag-over', g.key)"
        @drop.prevent="emit('drop', g)"
      >
        <span
          v-if="g.color"
          aria-hidden="true"
          class="col-signal"
          :style="{ '--signal-color': g.color }"
        />
        <header class="relative flex shrink-0 items-center gap-2 px-3 pt-3 pb-2.5">
          <span
            v-if="reorderable()"
            data-testid="column-grip"
            aria-label="Reorder column"
            class="-ml-1 touch-none cursor-grab text-muted-foreground/30 transition-opacity hover:text-muted-foreground/60 active:cursor-grabbing"
            :class="activeKey ? 'opacity-100' : 'opacity-0 group-hover/col:opacity-100'"
            @pointerdown.prevent="onGripDown(g.key, $event)"
          >
            <GripVertical class="size-3.5" />
          </span>
          <span
            v-if="g.color"
            class="size-2 shrink-0 rounded-full"
            :style="{ backgroundColor: g.color, boxShadow: `0 0 0 3px ${g.color}2e` }"
          />
          <h2 class="truncate text-sm font-semibold tracking-tight text-foreground">
            {{ g.label }}
          </h2>
          <span
            class="ml-auto rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-2xs font-medium tabular-nums text-muted-foreground/80"
          >
            {{ g.issues.length }}
          </span>
        </header>
        <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-0.5 pb-2.5">
          <div
            v-for="(issue, i) in g.issues"
            :key="issue.iid"
            :draggable="!selectMode"
            class="group/card transition-opacity"
            :class="[
              selectMode ? '' : 'cursor-grab active:cursor-grabbing',
              draggingIid === issue.iid ? 'opacity-40' : '',
              justDropped === issue.iid ? 'animate-drop-in' : '',
            ]"
            :style="{ order: i * 2, viewTransitionName: vtNameFor(issue.iid) }"
            @dragstart="!selectMode && emit('drag-start', issue, $event)"
            @dragend="emit('drag-end')"
          >
            <IssueCard
              :issue="issue"
              :full-path="fullPath"
              :highlight="issue.iid === highlightIid"
              @filter="emit('filter', $event)"
            >
              <GripVertical
                class="size-3.5 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover/card:opacity-100"
              />
            </IssueCard>
          </div>
          <div
            v-if="isDropTarget(g)"
            :style="{ order: ghostIndex(g) * 2 - 1 }"
            class="ghost-card pointer-events-none flex items-start gap-2 rounded-lg border border-dashed border-primary/60 bg-primary/8 px-3 py-2.5"
          >
            <span class="mt-1 size-2 shrink-0 rounded-full bg-primary/70" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-medium text-primary/90">
                {{ dragging?.title }}
              </span>
              <span class="mt-0.5 block text-2xs text-primary/55">Move here</span>
            </span>
          </div>
          <div
            v-if="!g.issues.length && !isDropTarget(g)"
            class="grid flex-1 place-items-center px-2 py-6 text-center"
          >
            <span class="font-mono text-2xs tracking-wide text-muted-foreground/35">
              drop here
            </span>
          </div>
        </div>
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
/* FLIP the columns into place when their order changes. */
.col-move {
  transition: transform 200ms ease;
}
/* Brief settle on the column that just landed. */
.reorder-settle {
  animation: reorder-settle 360ms ease;
}
@keyframes reorder-settle {
  0% {
    transform: scale(0.96);
  }
  60% {
    transform: scale(1.02);
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
