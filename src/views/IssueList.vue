<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, toRef, watch } from 'vue'
import { useIntersectionObserver, useTitle, onKeyStroke, useElementBounding } from '@vueuse/core'
import {
  Plus,
  Search,
  LoaderCircle,
  List,
  Columns3,
  X,
  GripVertical,
  ArrowLeft,
  Workflow,
  RefreshCw,
} from '@lucide/vue'
import { useIssues, type IssueListItem } from '@/composables/useIssues'
import { usePipelines } from '@/composables/usePipelines'
import { isActivePipeline } from '@/gitlab/pipelineParams'
import { TONE_VISUALS } from '@/components/pipelineTone'
import { useProjectLabels } from '@/composables/useProjectLabels'
import { useProjectMembers } from '@/composables/useProjectMembers'
import { useIssueFilters } from '@/composables/useIssueFilters'
import { useRetagIssue, useReassignIssue } from '@/composables/useIssueMutations'
import { useWorkItemStatuses, useSetIssueStatus } from '@/composables/useWorkItemStatus'
import { useSavedViews } from '@/composables/useSavedViews'
import IssueComposer from '@/components/IssueComposer.vue'
import IssueFilterPanel from '@/components/IssueFilterPanel.vue'
import SavedViews from '@/components/SavedViews.vue'
import type { IssueFilters } from '@/gitlab/issueParams'
import {
  sortIssues,
  groupIssues,
  boardColumns,
  boardDropIndex,
  labelScopes,
  planBoardMove,
  SORTS,
  GROUPS,
  BOARD_GROUPS,
  type Facet,
  type IssueGroup,
} from '@/lib/issueView'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from '@/composables/useConfirm'
import IssueRow from '@/components/IssueRow.vue'
import IssueCard from '@/components/IssueCard.vue'
import IssueDrawer from '@/components/IssueDrawer.vue'
import LabelChip from '@/components/LabelChip.vue'
import Odometer from '@/components/Odometer.vue'
import { withViewTransition } from '@/lib/viewTransition'
import ErrorNotice from '@/components/ErrorNotice.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const props = defineProps<{ fullPath: string }>()

const route = useRoute()
const router = useRouter()
const { confirm } = useConfirm()
const drawerDirty = ref(false)

// Drawer is driven by ?issue=<iid> on this route, so back/refresh/links all work.
const openIid = computed(() => {
  const q = route.query.issue
  return typeof q === 'string' && q ? q : null
})

async function setDrawerOpen(value: boolean) {
  if (value) return // opening is driven by issue links, not this handler
  if (drawerDirty.value) {
    const ok = await confirm({
      title: 'Discard unsaved changes?',
      description: "Your edits to this issue haven't been saved.",
    })
    if (!ok) return
  }
  drawerDirty.value = false
  const { issue: _issue, ...rest } = route.query
  router.replace({ query: rest })
}

async function expandIssue() {
  if (!openIid.value) return
  if (drawerDirty.value) {
    const ok = await confirm({
      title: 'Discard unsaved changes?',
      description: "Your edits to this issue haven't been saved.",
    })
    if (!ok) return
  }
  drawerDirty.value = false
  const iid = openIid.value
  withViewTransition(async () => {
    await router.push({ name: 'issue', params: { fullPath: props.fullPath, iid } })
    await nextTick()
  })
}

const {
  state,
  search,
  labels: labelTitles,
  assignee,
  author,
  sort: sortKey,
  group: groupKey,
  view,
  scope: boardScope,
  activeCount,
  toggleLabel,
  clearAll,
  filters,
  viewSlice,
  applyView,
} = useIssueFilters()
const { data: members } = useProjectMembers(toRef(props, 'fullPath'))

// Named snapshots of the whole view (filters + sort + group + view + scope +
// state + search), saved per project.
const savedViews = useSavedViews(toRef(props, 'fullPath'))
const activeViewId = computed(() => savedViews.activeId(viewSlice.value))
const canSaveView = computed(() => Object.keys(viewSlice.value).length > 0)
// Remember which view was loaded so we can offer "update" once its filters
// drift. Reset when switching projects (the view list re-keys).
const loadedViewId = ref<string | null>(null)
watch(
  () => props.fullPath,
  () => (loadedViewId.value = null),
)

function loadView(view: { id: string; query: typeof viewSlice.value }) {
  applyView(view.query)
  loadedViewId.value = view.id
}
function saveCurrentView(name: string) {
  loadedViewId.value = savedViews.add(name, viewSlice.value)?.id ?? null
}
function updateView(id: string) {
  savedViews.update(id, viewSlice.value)
}
function removeView(id: string) {
  savedViews.remove(id)
  if (loadedViewId.value === id) loadedViewId.value = null
}

type StateValue = NonNullable<IssueFilters['state']>
const STATES: { value: StateValue; label: string }[] = [
  { value: 'opened', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

// Split the project path so the final segment (the repo) can be emphasized.
const pathParts = computed(() => props.fullPath.split('/'))
const repoName = computed(() => pathParts.value.at(-1) ?? props.fullPath)
const pathPrefix = computed(() => pathParts.value.slice(0, -1).join('/'))

// Reflect the active repo in the tab title — quiet polish for a daily driver
// that lives across many tabs.
useTitle(computed(() => `${repoName.value} · lumen`))

const { issues, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage, refetch } =
  useIssues(toRef(props, 'fullPath'), filters)

// Manual refresh: refetch every loaded page on demand. We track our own flag
// (rather than the query's `isFetching`) so the spinner reflects only the user's
// click, not the background poll or pagination fetches.
const isRefreshing = ref(false)
async function refresh() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await refetch()
  } finally {
    isRefreshing.value = false
  }
}

const count = computed(() => issues.value.length)
const hasMore = computed(() => hasNextPage.value ?? false)

// Mirror the Pipelines view's polling query so the toolbar button can flag live
// CI at a glance without navigating away. Shares the same query cache key, so
// this adds no network beyond the 10s poll the feature already runs and opening
// Pipelines stays instant. Count every in-flight pipeline (anything not in a
// terminal state) — queued/pending/manual still have work ahead of them.
const { pipelines } = usePipelines(toRef(props, 'fullPath'))
const runningPipelines = computed(
  () => pipelines.value.filter((p) => isActivePipeline(p.status)).length,
)
const runningDotClass = TONE_VISUALS.running.dot

// Board fills the page: its height is the viewport minus its own distance from
// the top (measured, so it stays correct as the toolbar rows wrap/grow). It
// reaches the true viewport bottom — the `-mb-6` on the element cancels <main>'s
// bottom padding so the horizontal scrollbar sits flush at the bottom edge with
// no gap beneath it, and the page gains no vertical scroll.
// Measure the board's top off a zero-size sentinel pinned to its top edge, not
// the board itself: deriving the board's height from its own measured bounds
// would feed every height change back into the observer ("ResizeObserver loop
// completed with undelivered notifications"). The sentinel never resizes, so
// the loop can't form, while still tracking the top as the toolbar grows.
const boardTopEl = ref<HTMLElement | null>(null)
const { top: boardTop } = useElementBounding(boardTopEl)
const boardStyle = computed(() => ({
  height: `calc(100dvh - ${Math.max(0, Math.round(boardTop.value))}px)`,
}))

// Sort/group happen client-side on the loaded set — priority & status live in
// scoped labels, which the server can't order by.
const sorted = computed(() => sortIssues(issues.value, sortKey.value))
const listGroups = computed(() => groupIssues(sorted.value, groupKey.value))

// --- view switch as a morph -------------------------------------------------
// Toggling list ⇄ board runs inside a View Transition so each visible issue's
// row FLIPs into its board card (and back) rather than the layout hard-cutting.
// Only the first VT_CAP issues are named for the transition — enough to carry
// the eye, bounded so a large loaded set never snapshots hundreds of elements.
const VT_CAP = 30
const vtNamed = computed(() => new Set(sorted.value.slice(0, VT_CAP).map((i) => i.iid)))
const vtNameFor = (iid: string) => (vtNamed.value.has(iid) ? `issue-${iid}` : undefined)

function setView(next: 'list' | 'board') {
  if (view.value === next) return
  withViewTransition(async () => {
    view.value = next
    // The board is bounded to the viewport height and full-bleed — start it at
    // the top so the whole board is in view (and its measured top is correct)
    // rather than stranded below a scrolled-down list.
    if (next === 'board') window.scrollTo({ top: 0 })
    await nextTick()
  })
}

// Tab-style hops to this project's other surfaces (→ pipelines) morph the shared
// repo title and cross-fade the rest, the same handoff the picker → issues uses.
// Modified clicks fall through to the real href so "open in new window" still works.
function onTabNav(e: MouseEvent, to: Parameters<typeof router.push>[0]) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  e.preventDefault()
  withViewTransition(async () => {
    await router.push(to)
    await nextTick()
  })
}

const { data: projectLabels } = useProjectLabels(toRef(props, 'fullPath'))
const { data: statusCatalog } = useWorkItemStatuses(toRef(props, 'fullPath'))
const labelCatalog = computed(() => projectLabels.value ?? [])
const scopeOptions = computed(() => labelScopes(labelCatalog.value))
const boardGroups = computed(() =>
  boardColumns(sorted.value, boardScope.value, {
    labelCatalog: labelCatalog.value,
    statusCatalog: statusCatalog.value ?? [],
  }),
)
// If the board is grouped by a label scope that's no longer in the catalog
// (project changed, label deleted), fall back to the always-available Status.
watch(scopeOptions, (opts) => {
  const key = boardScope.value
  if (key.startsWith('label:') && opts.length && !opts.includes(key.slice('label:'.length))) {
    boardScope.value = 'status'
  }
})

// --- drag to update (retag / set status / reassign) -------------------------
const retag = useRetagIssue(props.fullPath)
const reassign = useReassignIssue(props.fullPath)
const setStatus = useSetIssueStatus(props.fullPath)
const dragging = ref<IssueListItem | null>(null)
const draggingIid = ref<string | null>(null)
const dragOverKey = ref<string | null>(null)
// The iid that just landed in a new lane — it wears the settle animation briefly
// so an optimistic move reads as the card arriving, not blinking into place.
const justDropped = ref<string | null>(null)
let dropTimer: ReturnType<typeof setTimeout> | undefined

// A compact "in-hand" ghost that follows the cursor while dragging, in place of
// the browser's default full-card snapshot. Built imperatively (it lives outside
// Vue's tree, only long enough to be snapshotted) and styled with theme tokens so
// it matches light/dark. Rendered off-screen so it never flashes in the page.
function buildDragGhost(issue: IssueListItem): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = [
    'position:fixed',
    'top:-1000px',
    'left:-1000px',
    'display:flex',
    'align-items:center',
    'gap:0.5rem',
    'max-width:18rem',
    'padding:0.5rem 0.75rem',
    'border-radius:0.625rem',
    'background:var(--card)',
    'color:var(--foreground)',
    'border:1px solid color-mix(in oklab, var(--primary) 55%, transparent)',
    'box-shadow:0 12px 30px rgba(0,0,0,0.45), 0 0 0 1px color-mix(in oklab, var(--primary) 22%, transparent)',
    'font-size:0.75rem',
    'font-weight:500',
    'line-height:1.2',
    'white-space:nowrap',
    'overflow:hidden',
  ].join(';')
  const dot = document.createElement('span')
  dot.style.cssText =
    'flex:0 0 auto;width:0.5rem;height:0.5rem;border-radius:9999px;background:var(--primary)'
  const text = document.createElement('span')
  text.textContent = issue.title
  text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
  el.append(dot, text)
  return el
}

function onDragStart(issue: IssueListItem, e: DragEvent) {
  dragging.value = issue
  draggingIid.value = issue.iid
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(issue.iid))
    // Custom drag image: append off-screen, snapshot, then drop on the next tick
    // (the snapshot is taken synchronously, so the live node isn't needed after).
    const ghost = buildDragGhost(issue)
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 14, 16)
    setTimeout(() => ghost.remove(), 0)
  }
}
function clearDrag() {
  dragging.value = null
  draggingIid.value = null
  dragOverKey.value = null
}
function onDrop(group: IssueGroup) {
  const issue = dragging.value
  clearDrag()
  if (!issue) return
  const move = planBoardMove(issue, boardScope.value, group)
  if (!move) return
  // Mark the moved card so it settles into its new lane (cleared after the anim).
  justDropped.value = issue.iid
  clearTimeout(dropTimer)
  dropTimer = setTimeout(() => (justDropped.value = null), 450)
  if (move.kind === 'retag') {
    retag.mutate({ iid: issue.iid, ...move })
  } else if (move.kind === 'status') {
    // The column key is the status id; pull the full status for the optimistic patch.
    const nextStatus = statusCatalog.value?.find((s) => s.id === group.key)
    if (nextStatus) setStatus.mutate({ iid: issue.iid, statusId: move.statusId, nextStatus })
  } else {
    // Reassign to the column's member (or clear for Unassigned). group.key is the
    // username; build the optimistic assignee node from the project members.
    const member = members.value?.find((m) => m.username === group.key)
    const nextAssignees = member
      ? [
          {
            id: member.id,
            name: member.name,
            username: member.username,
            avatarUrl: member.avatarUrl ?? null,
          },
        ]
      : []
    reassign.mutate({ iid: issue.iid, assigneeUsernames: move.assigneeUsernames, nextAssignees })
  }
}

// A column is a live drop target only while it's hovered AND dropping there
// would actually move the card — `planBoardMove` returns null for the card's own
// column (and the un-clearable "No status" lane). We use this for both the lane
// highlight and the ghost placeholder, so the source lane stays quiet and the
// ghost marks exactly where a real move lands.
function isDropTarget(group: IssueGroup): boolean {
  if (!dragging.value || dragOverKey.value !== group.key) return false
  return planBoardMove(dragging.value, boardScope.value, group) != null
}

// Where the ghost sits in a target lane: the position the card will sort into
// once dropped (see boardDropIndex), so the placeholder previews the real spot.
function ghostIndex(group: IssueGroup): number {
  return dragging.value ? boardDropIndex(group.issues, dragging.value, sortKey.value) : 0
}

// --- active filters ---------------------------------------------------------
function applyFacet(f: Facet) {
  if (f.kind === 'assignee') {
    assignee.value = assignee.value === f.value ? '' : f.value
    return
  }
  toggleLabel(f.value)
}
const removeLabel = (title: string) => toggleLabel(title)
function clearFilters() {
  clearAll()
}

// Resolved label chips with color from the catalog (titles no longer carry color)
const labelChips = computed(() =>
  labelTitles.value.map((title) => ({
    title,
    color: labelCatalog.value.find((l) => l.title === title)?.color ?? '#888',
  })),
)

function loadMore() {
  if (hasNextPage.value && !isFetchingNextPage.value) fetchNextPage()
}
const sentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting) loadMore()
})

// --- composer + new-issue highlight -----------------------------------------
const composerOpen = ref(false)
const highlightIid = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | undefined

function onCreated(iid: string) {
  highlightIid.value = iid
  clearTimeout(highlightTimer)
  // Matches the 1.6s flash-in animation; clear so re-renders don't replay it.
  highlightTimer = setTimeout(() => (highlightIid.value = null), 1600)
}

onUnmounted(() => {
  clearTimeout(highlightTimer)
  clearTimeout(dropTimer)
})

// `C` opens the composer — but never while typing or with another surface open.
// Accept both cases so Caps Lock / Shift don't swallow the shortcut.
onKeyStroke(['c', 'C'], (e) => {
  const t = e.target as HTMLElement | null
  if (t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return
  if (composerOpen.value || openIid.value) return
  e.preventDefault()
  composerOpen.value = true
})
</script>

<template>
  <section class="space-y-5">
    <!-- Header -->
    <div class="flex items-end justify-between gap-4">
      <div class="min-w-0">
        <p
          class="eyebrow-tick font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
        >
          Issues
        </p>
        <!-- The title doubles as the way back. With the app masthead gone this is
             the only route up to the project picker, so the project name itself is
             the link — the arrow takes the lead position and slides on hover, the
             same affordance the detail view uses to step back to this list. The
             view-transition name stays on the <h1> so the picker→issues morph
             still lands on the title text. -->
        <RouterLink
          :to="{ name: 'projects' }"
          data-testid="back-to-projects"
          class="group/back -ml-1 mt-2 flex max-w-full items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
        >
          <ArrowLeft
            class="size-5 shrink-0 text-primary transition-transform group-hover/back:-translate-x-0.5"
          />
          <h1
            class="vt-project-title min-w-0 truncate text-title leading-none font-semibold text-foreground"
          >
            {{ repoName }}
          </h1>
        </RouterLink>
        <p v-if="pathPrefix" class="mt-1.5 truncate font-mono text-xs text-muted-foreground/75">
          {{ pathPrefix }}/
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <Button variant="outline" data-testid="view-pipelines" as-child>
          <RouterLink
            :to="{ name: 'pipelines', params: { fullPath } }"
            @click="onTabNav($event, { name: 'pipelines', params: { fullPath } })"
          >
            <Workflow />
            Pipelines
            <!-- Live CI tell: a pulsing sky dot + count when pipelines are
                 running right now, so the button reads as "something's cooking"
                 before you click through. Hidden entirely when nothing runs. -->
            <span
              v-if="runningPipelines > 0"
              data-testid="pipelines-running"
              class="-mr-0.5 inline-flex items-center gap-1.5 font-mono text-xs font-medium tabular-nums text-sky-300"
              :title="`${runningPipelines} active`"
            >
              <span class="size-2 shrink-0 rounded-full animate-pulse" :class="runningDotClass" />
              {{ runningPipelines }}
            </span>
          </RouterLink>
        </Button>
        <Button data-testid="new-issue" @click="composerOpen = true">
          <Plus />
          New issue
        </Button>
        <div
          class="hidden shrink-0 flex-col items-end transition-opacity sm:flex"
          :class="isLoading ? 'opacity-0' : 'opacity-100'"
        >
          <span
            class="inline-flex items-baseline font-mono text-hero font-semibold tabular-nums text-foreground"
          >
            <Odometer :value="count" />
            <span class="text-primary" v-if="hasMore">+</span>
          </span>
          <span
            class="mt-2 font-mono text-micro font-medium tracking-[0.22em] text-muted-foreground/70 uppercase"
          >
            {{ count === 1 ? 'issue' : 'issues' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Toolbar row 1: state · search · view -->
    <div class="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Filter issues by state"
        class="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
      >
        <button
          v-for="s in STATES"
          :key="s.value"
          type="button"
          :aria-pressed="state === s.value"
          class="rounded-[7px] px-3 py-1 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
          :class="
            state === s.value
              ? 'bg-card text-foreground shadow-card ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="state = s.value"
        >
          {{ s.label }}
        </button>
      </div>

      <div class="relative min-w-50 flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          v-model="search"
          type="search"
          placeholder="Search issues…"
          aria-label="Search issues"
          class="pl-9"
        />
      </div>

      <IssueFilterPanel
        v-model:labels="labelTitles"
        v-model:assignee="assignee"
        v-model:author="author"
        :catalog="labelCatalog"
        :members="members ?? []"
        :active-count="activeCount"
      />

      <SavedViews
        :views="savedViews.views.value"
        :active-id="activeViewId"
        :loaded-id="loadedViewId"
        :can-save="canSaveView"
        @apply="loadView"
        @save="saveCurrentView"
        @update="updateView"
        @rename="savedViews.rename"
        @remove="removeView"
      />

      <!-- Manual refresh: re-fetches loaded pages on demand, on top of the
           background poll. Spins only while the user's own refresh is in flight. -->
      <button
        type="button"
        data-testid="refresh-issues"
        aria-label="Refresh issues"
        title="Refresh"
        :disabled="isRefreshing"
        class="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97] disabled:opacity-60"
        @click="refresh"
      >
        <RefreshCw class="size-4" :class="isRefreshing ? 'animate-spin' : ''" />
      </button>

      <!-- View toggle -->
      <div
        role="group"
        aria-label="Switch view"
        class="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
      >
        <button
          type="button"
          aria-label="List view"
          :aria-pressed="view === 'list'"
          class="grid size-7 place-items-center rounded-[7px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
          :class="
            view === 'list'
              ? 'bg-card text-foreground shadow-card ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="setView('list')"
        >
          <List class="size-4" />
        </button>
        <button
          type="button"
          aria-label="Board view"
          :aria-pressed="view === 'board'"
          class="grid size-7 place-items-center rounded-[7px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
          :class="
            view === 'board'
              ? 'bg-card text-foreground shadow-card ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="setView('board')"
        >
          <Columns3 class="size-4" />
        </button>
      </div>
    </div>

    <!-- Toolbar row 2: sort + group (list only) -->
    <div v-if="view === 'list'" class="flex flex-wrap items-center gap-2">
      <Select v-model="sortKey">
        <SelectTrigger class="h-8 w-44 text-xs" aria-label="Sort issues">
          <span class="text-muted-foreground">Sort</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in SORTS" :key="s.value" :value="s.value">
            {{ s.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="groupKey">
        <SelectTrigger class="h-8 w-44 text-xs" aria-label="Group issues">
          <span class="text-muted-foreground">Group</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="g in GROUPS" :key="g.value" :value="g.value">
            {{ g.label }}
          </SelectItem>
          <!-- One entry per scoped-label group present in the project (team::,
               type::, …), grouping the list the same way the board's columns do. -->
          <template v-if="scopeOptions.length">
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Labels</SelectLabel>
              <SelectItem v-for="s in scopeOptions" :key="s" :value="`label:${s}`">
                {{ s }}
              </SelectItem>
            </SelectGroup>
          </template>
        </SelectContent>
      </Select>
    </div>

    <!-- Toolbar row 2 (board): sort cards + which facet becomes the columns -->
    <div v-else class="flex flex-wrap items-center gap-2">
      <Select v-model="sortKey">
        <SelectTrigger class="h-8 w-44 text-xs" aria-label="Sort issues">
          <span class="text-muted-foreground">Sort</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in SORTS" :key="s.value" :value="s.value">
            {{ s.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="boardScope">
        <SelectTrigger class="h-8 w-52 text-xs" aria-label="Column grouping">
          <span class="text-muted-foreground">Columns by</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="g in BOARD_GROUPS" :key="g.value" :value="g.value">
            {{ g.label }}
          </SelectItem>
          <!-- Same scoped-label groups the list offers — each becomes a column set. -->
          <template v-if="scopeOptions.length">
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Labels</SelectLabel>
              <SelectItem v-for="s in scopeOptions" :key="s" :value="`label:${s}`">
                {{ s }}
              </SelectItem>
            </SelectGroup>
          </template>
        </SelectContent>
      </Select>
      <span class="text-xs text-muted-foreground/60">Drag cards to update</span>
    </div>

    <!-- Active filter tokens -->
    <div v-if="activeCount" class="relative flex flex-wrap items-center gap-2">
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
          @remove="removeLabel(l.title)"
        />
        <span
          v-if="assignee"
          key="facet:assignee"
          class="inline-flex items-center gap-1 rounded-full bg-muted/60 py-0.5 pr-1 pl-2 text-2xs font-medium text-foreground/80 ring-1 ring-inset ring-white/10"
        >
          <span class="font-mono">{{
            assignee === '__none__' ? 'Unassigned' : '@' + assignee
          }}</span>
          <button
            type="button"
            aria-label="Remove assignee filter"
            class="grid size-4 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            @click="assignee = ''"
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
            @click="author = ''"
          >
            <X class="size-3" />
          </button>
        </span>
      </TransitionGroup>
      <button
        type="button"
        class="text-2xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:underline"
        @click="clearFilters"
      >
        Clear all
      </button>
    </div>

    <ErrorNotice v-if="error" :error="error" />

    <div
      v-else-if="isLoading"
      class="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div v-for="i in 6" :key="i" class="flex items-center gap-3 px-4 py-2">
        <Skeleton class="size-2 rounded-full" />
        <Skeleton class="size-5 rounded-md" />
        <Skeleton class="h-3.5 w-6" />
        <Skeleton class="h-3.5 flex-1" :style="{ maxWidth: `${40 + ((i * 13) % 45)}%` }" />
        <Skeleton class="h-5 w-16 rounded-full" />
      </div>
    </div>

    <template v-else>
      <template v-if="count">
        <!-- List view -->
        <div v-if="view === 'list'" class="space-y-5">
          <section v-for="g in listGroups" :key="g.key" class="space-y-2">
            <header v-if="groupKey !== 'none'" class="flex items-center gap-2 px-1">
              <span
                v-if="g.color"
                class="size-2 rounded-full"
                :style="{ backgroundColor: g.color }"
              />
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
                @filter="applyFacet"
              />
            </Card>
          </section>
        </div>

        <!-- Board view: full-bleed (breaks out of the centered column), bounded
             height, each column scrolls on its own, drag to retag. The inner
             track is w-max + mx-auto so the columns center when they fit the
             viewport and scroll from the left edge (no clipping) when they don't. -->
        <div
          v-else
          :style="boardStyle"
          class="relative left-1/2 -mb-6 w-screen -translate-x-1/2 overflow-x-auto pb-4"
        >
          <span ref="boardTopEl" aria-hidden="true" class="absolute top-0 left-0 h-0 w-0" />
          <div class="mx-auto flex h-full min-h-80 w-max gap-3 px-6">
            <section
              v-for="g in boardGroups"
              :key="g.key"
              class="relative flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl ring-1 ring-inset transition-[background-color,box-shadow,outline-color] duration-150 outline outline-offset-2 outline-transparent"
              :class="
                isDropTarget(g)
                  ? 'bg-primary/12 shadow-pop ring-primary/55 outline-primary/45'
                  : 'bg-card/55 shadow-card ring-border/70'
              "
              @dragover.prevent="dragOverKey = g.key"
              @dragenter.prevent="dragOverKey = g.key"
              @drop.prevent="onDrop(g)"
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
              <header class="relative flex shrink-0 items-center gap-2 px-3 pt-3 pb-2.5">
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
                  draggable="true"
                  class="group/card cursor-grab transition-opacity active:cursor-grabbing"
                  :class="[
                    draggingIid === issue.iid ? 'opacity-40' : '',
                    justDropped === issue.iid ? 'animate-drop-in' : '',
                  ]"
                  :style="{ order: i * 2, viewTransitionName: vtNameFor(issue.iid) }"
                  @dragstart="onDragStart(issue, $event)"
                  @dragend="clearDrag"
                >
                  <IssueCard
                    :issue="issue"
                    :full-path="fullPath"
                    :highlight="issue.iid === highlightIid"
                    @filter="applyFacet"
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
          </div>
        </div>

        <!-- Load more: auto-triggers via the sentinel, button is the fallback. -->
        <div v-if="hasMore" ref="sentinel" class="flex justify-center pt-1">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98] disabled:opacity-60"
            :disabled="isFetchingNextPage"
            @click="loadMore"
          >
            <LoaderCircle v-if="isFetchingNextPage" class="size-4 animate-spin text-primary" />
            {{ isFetchingNextPage ? 'Loading…' : 'Load more' }}
          </button>
        </div>
      </template>

      <!-- Empty state -->
      <div
        v-else
        class="flex animate-row-in flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center"
      >
        <div class="grid size-11 place-items-center rounded-full bg-muted">
          <Search class="size-5 text-muted-foreground" />
        </div>
        <p class="text-sm font-medium text-foreground">No issues.</p>
        <p class="max-w-xs text-xs text-muted-foreground">
          Nothing matches the current filters — adjust them above, or create one.
        </p>
        <Button data-testid="empty-new-issue" class="mt-1" @click="composerOpen = true">
          <Plus />
          Create issue
        </Button>
      </div>
    </template>

    <IssueDrawer
      :open="!!openIid"
      :full-path="fullPath"
      :iid="openIid"
      @update:open="setDrawerOpen"
      @update:dirty="drawerDirty = $event"
      @expand="expandIssue"
    />

    <IssueComposer
      :open="composerOpen"
      :full-path="fullPath"
      @update:open="composerOpen = $event"
      @created="onCreated"
    />
  </section>
</template>
