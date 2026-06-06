<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTitle, useIntersectionObserver } from '@vueuse/core'
import { Search, CornerDownLeft, FolderGit2, LoaderCircle, Star } from '@lucide/vue'
import {
  useProjectBrowser,
  type BrowserRow,
  type BrowserSectionKey,
} from '@/composables/useProjectBrowser'
import { useToggleStar } from '@/composables/useToggleStar'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import Odometer from '@/shared/components/Odometer.vue'
import { Input } from '@/shared/ui/input'
import { Card } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'

useTitle('Projects · lumen')

const router = useRouter()

const search = ref('')
const { flatRows, count, searching, isLoading, error, hasMore, fetchNextPage, isFetchingNextPage } =
  useProjectBrowser(search)
const toggleStar = useToggleStar()

const SECTION_LABELS: Record<BrowserSectionKey, string> = {
  starred: 'Starred',
  assigned: 'Assigned to me',
  all: 'All projects',
}
// Headers only earn their keep when there's more than the membership list to
// separate — a lone "All projects" group reads cleaner with no header.
const showHeaders = computed(
  () => !searching.value && flatRows.value.some((r) => r.section !== 'all'),
)
const sectionCount = (key: BrowserSectionKey) =>
  flatRows.value.filter((r) => r.section === key).length
const startsSection = (i: number) =>
  i === 0 || flatRows.value[i - 1]?.section !== flatRows.value[i].section

// Split each path so the repo (final segment) reads as the name and the rest
// trails as muted mono context — same emphasis the issues header uses.
const namespace = (fullPath: string) => {
  const parts = fullPath.split('/')
  return parts.slice(0, -1).join('/')
}

// One-letter monogram for the launcher rows — a derived initial, consistent with
// the initials-only avatars elsewhere (no fetched icons). It lights amber on the
// active row, so the glyph doubles as the "this one launches" selection signal.
const monogram = (name: string) => name.trim().charAt(0).toUpperCase() || '?'

// --- selection cursor -------------------------------------------------------
// The picker is a launcher first, a list second: a selection glides on the
// keyboard like a command palette. `active` is the logical cursor (an index into
// the flattened row list); the amber rail (`cursor`) chases it with a
// critically-damped spring so it has weight without the tackiness of a bounce.
const active = ref(0)
const listEl = ref<HTMLElement | null>(null)
const reduce =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

const cursor = reactive({ y: 0, h: 0, visible: false })
let velocity = 0
let raf = 0
let lastTs = 0

const rowAt = (i: number) => listEl.value?.querySelectorAll<HTMLElement>('[data-row]')[i] ?? null

function springTo(snap = false) {
  const el = rowAt(active.value)
  if (!el) {
    cursor.visible = false
    return
  }
  cursor.visible = true
  cursor.h = el.offsetHeight
  const target = el.offsetTop
  cancelAnimationFrame(raf)

  if (snap || reduce?.matches) {
    cursor.y = target
    velocity = 0
    return
  }

  lastTs = performance.now()
  const step = (now: number) => {
    const dt = Math.min((now - lastTs) / 1000, 1 / 30)
    lastTs = now
    // stiffness/damping tuned just past critical: snappy arrival, no overshoot.
    const accel = -210 * (cursor.y - target) - 30 * velocity
    velocity += accel * dt
    cursor.y += velocity * dt
    if (Math.abs(cursor.y - target) < 0.3 && Math.abs(velocity) < 0.3) {
      cursor.y = target
      velocity = 0
      return
    }
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}

function move(delta: number) {
  if (!count.value) return
  active.value = Math.max(0, Math.min(count.value - 1, active.value + delta))
  rowAt(active.value)?.scrollIntoView({ block: 'nearest' })
}

// Glide whenever the cursor target changes.
watch(active, () => springTo())

// A new search is a new context — reset to the top and snap (no glide across a
// list that just changed underneath). Appended pages must NOT reset the cursor.
watch(search, () => {
  active.value = 0
  nextTick(() => springTo(true))
})

// The row set changed: first data, an appended page, or a star toggle that hops a
// project between sections. Keep the selection on the same project where we can
// (`pinTo`), clamp it in range, then (re)place the rail.
const pinTo = ref<string | null>(null)
watch(flatRows, (rows, prev) => {
  if (pinTo.value) {
    const i = rows.findIndex((r) => r.fullPath === pinTo.value)
    if (i >= 0) active.value = i
    pinTo.value = null
  }
  if (active.value > rows.length - 1) active.value = Math.max(0, rows.length - 1)
  nextTick(() => springTo((prev?.length ?? 0) === 0))
})

// --- launch + morph ---------------------------------------------------------
// Launching morphs the chosen project's name into the issues header via a View
// Transition, so the picker → issues handoff reads as one instrument retuning
// rather than a page swap. Degrades to a plain push where VT is unavailable or
// motion is reduced.
const morphingPath = ref<string | null>(null)
const nameStyle = (row: BrowserRow) =>
  row.fullPath === morphingPath.value ? { viewTransitionName: 'project-title' } : undefined

function navigate(row: BrowserRow) {
  return router.push({ name: 'issues', params: { fullPath: row.fullPath } })
}

async function launch(row: BrowserRow, i: number) {
  active.value = i
  const canMorph = typeof document.startViewTransition === 'function' && !reduce?.matches
  if (!canMorph) {
    navigate(row)
    return
  }
  morphingPath.value = row.fullPath
  await nextTick() // ensure the name carries the transition-name before snapshot
  document.startViewTransition(async () => {
    await navigate(row)
    await nextTick()
  })
}

function onRowClick(e: MouseEvent, row: BrowserRow, i: number) {
  // Let the browser handle modified clicks (open in new tab) via the real href.
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  e.preventDefault()
  launch(row, i)
}

// Toggle the star; pin the selection to this project so the rail follows it as it
// hops into (or out of) the Starred section.
function onToggleStar(row: BrowserRow) {
  pinTo.value = row.fullPath
  toggleStar.mutate({ fullPath: row.fullPath, name: row.name, starred: row.starred })
}

// --- keyboard ---------------------------------------------------------------
const searchInput = ref<{ $el?: HTMLElement } | null>(null)
const focusSearch = () => searchInput.value?.$el?.focus?.()
const searchFocused = () =>
  !!searchInput.value?.$el && document.activeElement === searchInput.value.$el

function onKeydown(e: KeyboardEvent) {
  // ⌘1–9 (or Ctrl): jump straight to a project and launch it, from anywhere.
  if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
    const i = Number(e.key) - 1
    const row = flatRows.value[i]
    if (row) {
      e.preventDefault()
      launch(row, i)
    }
    return
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      move(1)
      return
    case 'ArrowUp':
      e.preventDefault()
      move(-1)
      return
    case 'Enter': {
      const row = flatRows.value[active.value]
      if (row) {
        e.preventDefault()
        launch(row, active.value)
      }
      return
    }
    case 'Escape':
      if (search.value) {
        search.value = ''
      } else {
        searchInput.value?.$el?.blur?.()
      }
      return
  }

  if (searchFocused()) {
    // j/k are nav only when not typing into the field.
    return
  }

  if (e.key === 'j') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'k') {
    e.preventDefault()
    move(-1)
  } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    // Type-to-filter from anywhere: focus the field and let the keypress land.
    // (No single-letter star shortcut — it would shadow type-to-filter.)
    focusSearch()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  nextTick(() => springTo(true))
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  cancelAnimationFrame(raf)
})

// --- infinite load ----------------------------------------------------------
function loadMore() {
  if (hasMore.value && !isFetchingNextPage.value) fetchNextPage()
}
const sentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting) loadMore()
})
</script>

<template>
  <section class="space-y-5">
    <!-- Header — mirrors the issues view so the entry feels of a piece. -->
    <div class="flex items-end justify-between gap-4">
      <div class="min-w-0">
        <p
          class="eyebrow-tick font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
        >
          Workspace
        </p>
        <h1 class="mt-2 text-title leading-none font-semibold text-foreground">Projects</h1>
      </div>
      <div v-if="!isLoading && !error" class="hidden shrink-0 flex-col items-end sm:flex">
        <span
          class="inline-flex items-baseline font-mono text-hero font-semibold tabular-nums text-foreground"
        >
          <Odometer :value="count" />
          <span v-if="hasMore" class="text-primary">+</span>
        </span>
        <span
          class="mt-2 font-mono text-micro font-medium tracking-[0.22em] text-muted-foreground/70 uppercase"
        >
          {{ count === 1 ? 'project' : 'projects' }}
        </span>
      </div>
    </div>

    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref="searchInput"
        v-model="search"
        type="search"
        placeholder="Search projects…"
        aria-label="Search projects"
        class="h-11 rounded-lg pl-11 text-base shadow-card"
      />
    </div>

    <ErrorNotice v-if="error" :error="error" />

    <div
      v-else-if="isLoading"
      class="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div v-for="i in 6" :key="i" class="flex items-center gap-3 px-4 py-3">
        <Skeleton class="size-7 rounded-md" />
        <Skeleton class="h-3.5" :style="{ width: `${30 + ((i * 17) % 40)}%` }" />
        <Skeleton class="h-3 w-24" />
      </div>
    </div>

    <template v-else>
      <Card
        v-if="count"
        class="relative gap-0 overflow-hidden p-0 shadow-pop"
        role="listbox"
        aria-label="Projects"
      >
        <!-- The selection rail: one element that glides between rows on a spring.
             The amber "you are here" signal lives in the active row's monogram,
             so the rail itself is a clean accent band. -->
        <div
          class="pointer-events-none absolute inset-x-1 top-0 z-0 rounded-lg bg-accent ring-1 ring-inset ring-border transition-[height,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]"
          :style="{
            transform: `translateY(${cursor.y}px)`,
            height: `${cursor.h}px`,
            opacity: cursor.visible ? 1 : 0,
          }"
        />

        <!-- Rows wrapper carries the [data-row] elements the spring rail measures;
             it stays unpositioned so rows still offset against the relative Card. -->
        <div ref="listEl">
          <template v-for="(row, i) in flatRows" :key="row.fullPath">
            <!-- Section header — sits between rows, never carries [data-row], so the
               rail's row indexing stays aligned to the flat list. -->
            <div
              v-if="showHeaders && startsSection(i)"
              class="relative z-10 flex items-center gap-2 px-3 pt-4 pb-1.5 first:pt-2.5"
            >
              <Star
                v-if="row.section === 'starred'"
                class="size-3 text-primary"
                fill="currentColor"
              />
              <span
                class="font-mono text-micro font-semibold tracking-[0.22em] text-muted-foreground/70 uppercase"
              >
                {{ SECTION_LABELS[row.section] }}
              </span>
              <span class="font-mono text-micro tabular-nums text-muted-foreground/40">
                {{ sectionCount(row.section) }}
              </span>
            </div>

            <RouterLink
              data-row
              role="option"
              :aria-selected="i === active"
              :to="{ name: 'issues', params: { fullPath: row.fullPath } }"
              class="group relative z-10 flex animate-row-in items-center gap-3 rounded-lg py-2.5 pr-2.5 pl-3 outline-none"
              :style="{ animationDelay: `${Math.min(i, 14) * 26}ms` }"
              @mouseenter="active = i"
              @click="onRowClick($event, row, i)"
              @focus="active = i"
            >
              <!-- Monogram: a derived initial that lights amber on the active row, so
                 the glyph is also the "this one launches" signal. -->
              <span
                class="grid size-7 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold ring-1 ring-inset transition-colors"
                :class="
                  i === active
                    ? 'bg-primary/15 text-primary ring-primary/30'
                    : 'bg-muted/60 text-muted-foreground ring-border/60'
                "
              >
                {{ monogram(row.name) }}
              </span>

              <span class="flex min-w-0 flex-1 items-baseline gap-2">
                <span
                  class="shrink-0 text-base font-medium tracking-tight transition-colors"
                  :class="i === active ? 'text-foreground' : 'text-foreground/90'"
                  :style="nameStyle(row)"
                >
                  {{ row.name }}
                </span>
                <span
                  v-if="namespace(row.fullPath)"
                  class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground/55"
                >
                  {{ namespace(row.fullPath) }}/
                </span>
              </span>

              <!-- Right cluster: assigned count, the star toggle, then the Enter
                 affordance + quick-jump keycap for the first nine rows. -->
              <span class="flex shrink-0 items-center gap-1.5">
                <span
                  v-if="row.assignedOpen"
                  class="mr-0.5 font-mono text-2xs tabular-nums text-muted-foreground/65"
                >
                  {{ row.assignedOpen }} open
                </span>

                <button
                  type="button"
                  :aria-label="row.starred ? `Unstar ${row.name}` : `Star ${row.name}`"
                  :aria-pressed="row.starred"
                  class="relative z-10 grid size-7 place-items-center rounded-md outline-none transition-colors focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60"
                  :class="
                    row.starred
                      ? 'text-primary'
                      : i === active
                        ? 'text-muted-foreground/50 hover:text-foreground'
                        : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground'
                  "
                  @click.stop.prevent="onToggleStar(row)"
                >
                  <Star
                    class="size-4"
                    :fill="row.starred ? 'currentColor' : 'none'"
                    :stroke-width="2"
                  />
                </button>

                <CornerDownLeft
                  class="size-3.5 text-primary transition-opacity duration-150"
                  :class="i === active ? 'opacity-100' : 'opacity-0'"
                />
                <kbd
                  v-if="i < 9"
                  class="grid h-5 min-w-5 place-items-center rounded border px-1 font-mono text-micro tabular-nums transition-colors"
                  :class="
                    i === active
                      ? 'border-border bg-muted/60 text-muted-foreground'
                      : 'border-border/50 text-muted-foreground/40'
                  "
                >
                  {{ i + 1 }}
                </kbd>
              </span>
            </RouterLink>
          </template>
        </div>

        <!-- Load more: the sentinel auto-fetches; the row also reports state. -->
        <div
          v-if="hasMore"
          ref="sentinel"
          class="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"
        >
          <LoaderCircle v-if="isFetchingNextPage" class="size-3.5 animate-spin" />
          <span>{{ isFetchingNextPage ? 'Loading…' : 'Scroll for more' }}</span>
        </div>
      </Card>

      <!-- Teaching empty state — distinguishes "no match" from "nothing here yet". -->
      <div
        v-else
        class="flex animate-row-in flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center"
      >
        <div class="grid size-11 place-items-center rounded-full bg-muted">
          <component :is="search ? Search : FolderGit2" class="size-5 text-muted-foreground" />
        </div>
        <p class="text-sm font-medium text-foreground">
          {{ search ? 'No matches.' : 'No projects.' }}
        </p>
        <p class="max-w-xs text-xs text-muted-foreground">
          {{
            search
              ? `Nothing matches “${search}”. Try a different term.`
              : 'Projects from your GitLab instance will appear here as you gain access.'
          }}
        </p>
      </div>

      <!-- Keyboard legend — the launcher tells you how to fly it. -->
      <div
        v-if="count"
        class="hidden items-center gap-x-4 gap-y-1.5 px-1 font-mono text-2xs text-muted-foreground/55 select-none sm:flex sm:flex-wrap"
      >
        <span class="inline-flex items-center gap-1.5"><kbd class="kbd">type</kbd> filter</span>
        <span class="inline-flex items-center gap-1.5"><kbd class="kbd">↑↓</kbd> move</span>
        <span class="inline-flex items-center gap-1.5"><kbd class="kbd">⏎</kbd> open</span>
        <span class="inline-flex items-center gap-1.5"><kbd class="kbd">⌘1–9</kbd> jump</span>
      </div>
    </template>
  </section>
</template>
