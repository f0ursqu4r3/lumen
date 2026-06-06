<script setup lang="ts">
import { computed, ref } from 'vue'
import { useElementBounding } from '@vueuse/core'
import { GripVertical } from '@lucide/vue'
import IssueCard from '@/features/issues/components/IssueCard.vue'
import type { IssueListItem } from '@/features/issues/composables/useIssues'
import type { IssueGroup, Facet } from '@/features/issues/lib/issueView'

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
  reorderDragKey: string | null
  reorderOverKey: string | null
}>()
const emit = defineEmits<{
  filter: [f: Facet]
  'drag-start': [issue: IssueListItem, e: DragEvent]
  'drag-end': []
  drop: [g: IssueGroup]
  'drag-over': [key: string]
  'reorder-start': [key: string, e: DragEvent]
  'reorder-over': [key: string]
  'reorder-drop': [key: string]
  'reorder-end': []
}>()

// Columns reorder only when there's more than one.
const reorderable = () => props.boardGroups.length > 1

// board sizing — owns the sentinel it measures (moved from the view)
const boardTopEl = ref<HTMLElement | null>(null)
const { top: boardTop } = useElementBounding(boardTopEl)
const boardStyle = computed(() => ({
  height: `calc(100dvh - ${Math.max(0, Math.round(boardTop.value))}px)`,
}))
</script>

<template>
  <!-- Board view: full-bleed (breaks out of the centered column), bounded
       height, each column scrolls on its own, drag to retag. The inner
       track is w-max + mx-auto so the columns center when they fit the
       viewport and scroll from the left edge (no clipping) when they don't. -->
  <div
    :style="boardStyle"
    class="relative left-1/2 -mb-6 w-screen -translate-x-1/2 overflow-x-auto pb-4"
  >
    <span ref="boardTopEl" aria-hidden="true" class="absolute top-0 left-0 h-0 w-0" />
    <TransitionGroup tag="div" name="col" class="mx-auto flex h-full min-h-80 w-max gap-3 px-6">
      <section
        v-for="g in boardGroups"
        :key="g.key"
        class="relative flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl ring-1 ring-inset transition-[background-color,box-shadow,outline-color] duration-150 outline outline-offset-2 outline-transparent"
        :class="
          isDropTarget(g)
            ? 'bg-primary/12 shadow-pop ring-primary/55 outline-primary/45'
            : 'bg-card/55 shadow-card ring-border/70'
        "
        @dragover.prevent="emit('drag-over', g.key)"
        @dragenter.prevent="emit('drag-over', g.key)"
        @drop.prevent="emit('drop', g)"
      >
        <!-- Per-column status signal: a 1px border lit in the lane's own
           workflow-status color from the top-left corner, fading into the
           plain border — each column color-keyed to its state at a glance. -->
        <span
          v-if="g.color"
          aria-hidden="true"
          class="col-signal"
          :style="{ '--signal-color': g.color }"
        />
        <header
          class="relative flex shrink-0 items-center gap-2 rounded-md px-3 pt-3 pb-2.5"
          :class="[
            reorderDragKey === g.key ? 'opacity-50' : '',
            reorderOverKey === g.key && reorderDragKey !== g.key
              ? 'ring-1 ring-inset ring-primary/55'
              : '',
          ]"
          @dragover.prevent="reorderable() && emit('reorder-over', g.key)"
          @drop.prevent="emit('reorder-drop', g.key)"
        >
          <span
            v-if="reorderable()"
            data-testid="column-grip"
            draggable="true"
            aria-label="Reorder column"
            class="-ml-1 cursor-grab text-muted-foreground/30 transition-opacity hover:text-muted-foreground/60 active:cursor-grabbing"
            @dragstart="emit('reorder-start', g.key, $event)"
            @dragend="emit('reorder-end')"
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
          <!-- Ghost: a placeholder card at the landing spot, showing the
             dragged issue so it's clear what moves and where. Only renders
             in lanes where the drop is a real move (see isDropTarget). The
             flex `order` slots it at the sorted index it'll drop into —
             cards take even orders, the ghost the odd slot just before its
             target card (ghostIndex 0 ⇒ order -1, i.e. the top of the lane). -->
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
          <!-- Empty lane: a quiet placeholder gives the column presence and a
             visible target to drop a card into. Hidden while it's the live
             drop target — the ghost takes over. -->
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
  </div>
</template>

<style scoped>
/* FLIP the columns into place when their order changes. */
.col-move {
  transition: transform 200ms ease;
}
</style>
