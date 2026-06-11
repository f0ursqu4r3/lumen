<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTitle, useIntersectionObserver } from '@vueuse/core'
import { Search, FolderGit2, LoaderCircle, Star } from '@lucide/vue'
import {
  useProjectBrowser,
  type BrowserSectionKey,
} from '@/features/projects/composables/useProjectBrowser'
import { useSpringCursor } from '@/shared/composables/useSpringCursor'
import { useProjectLauncher } from '@/features/projects/composables/useProjectLauncher'
import { useProjectKeyboard } from '@/features/projects/composables/useProjectKeyboard'
import ProjectRow from '@/features/projects/components/ProjectRow.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import Odometer from '@/shared/components/Odometer.vue'
import { Input } from '@/shared/ui/input'
import { Card } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import ViewContainer from '@/shared/components/shell/ViewContainer.vue'

useTitle('Projects · lumen')

const search = ref('')
const { flatRows, count, searching, isLoading, error, hasMore, fetchNextPage, isFetchingNextPage } =
  useProjectBrowser(search)

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

// --- selection cursor -------------------------------------------------------
// The picker is a launcher first, a list second: a selection glides on the
// keyboard like a command palette. `active` is the logical cursor (an index into
// the flattened row list); the amber rail (`cursor`) chases it with a
// critically-damped spring so it has weight without the tackiness of a bounce.
const listEl = ref<HTMLElement | null>(null)
const { active, cursor, pinTo, springTo, move } = useSpringCursor({
  count,
  listEl,
  resetKey: search,
  rows: flatRows,
})

// Launch/morph + star toggle, and the command-palette keyboard surface (arrows /
// j-k / Enter / ⌘1–9 / type-to-filter), which also snaps the rail on mount.
const { nameStyle, launch, onRowClick, onToggleStar } = useProjectLauncher({ active, pinTo })
const { searchInput } = useProjectKeyboard({ flatRows, active, search, move, launch, springTo })

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
  <ViewContainer width="wide">
    <section class="space-y-5">
      <!-- Search + count share one line (the shell top bar carries the title and
           the rail provides My Work), so the picker opens straight onto its work. -->
      <div class="flex items-center gap-4">
        <div class="relative flex-1">
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
        <div v-if="!isLoading && !error" class="hidden shrink-0 items-baseline gap-1.5 sm:flex">
          <span
            class="counter-bezel inline-flex items-baseline font-mono text-hero font-semibold tabular-nums text-foreground"
          >
            <Odometer :value="count" />
            <span v-if="hasMore" class="text-primary">+</span>
          </span>
          <span
            class="font-mono text-micro font-medium tracking-[0.2em] text-muted-foreground/60 uppercase"
          >
            {{ count === 1 ? 'project' : 'projects' }}
          </span>
        </div>
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

              <ProjectRow
                :row="row"
                :index="i"
                :active="i === active"
                :name-style="nameStyle(row)"
                @row-click="onRowClick($event, row, i)"
                @toggle-star="onToggleStar(row)"
                @activate="active = i"
              />
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
  </ViewContainer>
</template>
