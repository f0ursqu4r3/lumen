<script setup lang="ts">
import { computed, nextTick, provide, ref, toRef, watch } from 'vue'
import { useIntersectionObserver, useTitle } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Search, LoaderCircle } from '@lucide/vue'
import { useIssues } from '@/features/issues/composables/useIssues'
import { usePipelines } from '@/features/pipelines/composables/usePipelines'
import { isActivePipeline } from '@/gitlab/pipelineParams'
import { TONE_VISUALS } from '@/features/pipelines/lib/pipelineTone'
import { useProjectLabels } from '@/features/labels/composables/useProjectLabels'
import { useProjectMembers } from '@/features/projects/composables/useProjectMembers'
import { useIssueFilters } from '@/features/issues/composables/useIssueFilters'
import { useWorkItemStatuses } from '@/features/issues/composables/useWorkItemStatus'
import { useIssueBoardDnd } from '@/features/issues/composables/useIssueBoardDnd'
import { useIssueSavedViews } from '@/features/issues/composables/useIssueSavedViews'
import { useIssueBulkHandlers } from '@/features/issues/composables/useIssueBulkHandlers'
import { useIssueComposer } from '@/features/issues/composables/useIssueComposer'
import { useRepoPath } from '@/shared/composables/useRepoPath'
import { useIssueDrawerRoute } from '@/features/issues/composables/useIssueDrawerRoute'
import { IssueSelectionKey } from '@/features/issues/composables/useIssueSelection'
import {
  sortIssues,
  groupIssues,
  boardColumns,
  applyOrder,
  labelScopes,
  type Facet,
} from '@/features/issues/lib/issueView'
import { useGroupOrder } from '@/features/issues/composables/useGroupOrder'
import { useGroupReorder } from '@/features/issues/composables/useGroupReorder'
import { withViewTransition } from '@/shared/lib/viewTransition'
import IssueListHeader from '@/features/issues/components/IssueListHeader.vue'
import IssueListToolbar from '@/features/issues/components/IssueListToolbar.vue'
import IssueListGroups from '@/features/issues/components/IssueListGroups.vue'
import IssueBoard from '@/features/issues/components/IssueBoard.vue'
import IssueActiveFilters from '@/features/issues/components/IssueActiveFilters.vue'
import IssueComposer from '@/features/issues/components/IssueComposer.vue'
import IssueDrawer from '@/features/issues/components/IssueDrawer.vue'
import BulkActionBar from '@/features/issues/components/BulkActionBar.vue'
import SavedViews from '@/shared/components/SavedViews.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

const props = defineProps<{ fullPath: string }>()
const route = useRoute()
const router = useRouter()

const { drawerDirty, openIid, setDrawerOpen, expandIssue } = useIssueDrawerRoute(
  toRef(props, 'fullPath'),
)

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
const {
  savedViews,
  activeViewId,
  canSaveView,
  loadedViewId,
  loadView,
  saveCurrentView,
  updateView,
  removeView,
} = useIssueSavedViews(toRef(props, 'fullPath'), viewSlice, applyView)

// Split the project path so the final segment (the repo) can be emphasized.
const { repoName, pathPrefix } = useRepoPath(toRef(props, 'fullPath'))

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

// Sort/group happen client-side on the loaded set — priority & status live in
// scoped labels, which the server can't order by.
const sorted = computed(() => sortIssues(issues.value, sortKey.value))
const { orderFor, hasOrder, setOrder, reset } = useGroupOrder(toRef(props, 'fullPath'))

const listGroups = computed(() =>
  applyOrder(groupIssues(sorted.value, groupKey.value), orderFor(groupKey.value)),
)

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

const { data: projectLabels } = useProjectLabels(toRef(props, 'fullPath'))
const { data: statusCatalog } = useWorkItemStatuses(toRef(props, 'fullPath'))
const labelCatalog = computed(() => projectLabels.value ?? [])
const scopeOptions = computed(() => labelScopes(labelCatalog.value))

// Multi-select state + bulk-action handlers, shared with rows/cards via inject.
const {
  selection,
  toggleSelectMode,
  onAddLabels,
  onRemoveLabels,
  onSetAssignee,
  onSetStatus,
  onOpenCombined,
} = useIssueBulkHandlers(toRef(props, 'fullPath'), members)
provide(IssueSelectionKey, selection)

// The iids currently loaded (across pages) — what "Select all" selects.
const loadedIids = computed(() => issues.value.map((i) => i.iid))

const boardGroups = computed(() =>
  applyOrder(
    boardColumns(sorted.value, boardScope.value, {
      labelCatalog: labelCatalog.value,
      statusCatalog: statusCatalog.value ?? [],
    }),
    orderFor(boardScope.value),
  ),
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
const {
  dragging,
  draggingIid,
  dragOverKey,
  justDropped,
  onDragStart,
  clearDrag,
  onDrop,
  isDropTarget,
  ghostIndex,
} = useIssueBoardDnd({ fullPath: props.fullPath, boardScope, sortKey, statusCatalog, members })

// --- drag to reorder groups / columns (pointer-driven) ----------------------
const { activeKey, pointer, barOffset, justReordered, start } = useGroupReorder({
  setOrder,
})

// The grouping dimension the active view arranges (list groups vs board cols).
const activeDimension = computed(() => (view.value === 'list' ? groupKey.value : boardScope.value))
const hasCustomOrder = computed(() => hasOrder(activeDimension.value))
const resetOrder = () => reset(activeDimension.value)

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

// --- composer + new-issue highlight + keyboard ------------------------------
const { composerOpen, highlightIid, onCreated } = useIssueComposer({ openIid, selection })

watch(
  () => route.query.compose,
  (value) => {
    if (value === '1') composerOpen.value = true
  },
  { immediate: true },
)

function setComposerOpen(value: boolean) {
  composerOpen.value = value
  if (value || route.query.compose !== '1') return
  const { compose: _compose, ...query } = route.query
  void router.replace({ query })
}
</script>

<template>
  <section class="space-y-5">
    <IssueListHeader
      :full-path="fullPath"
      :repo-name="repoName"
      :path-prefix="pathPrefix"
      :running-pipelines="runningPipelines"
      :running-dot-class="runningDotClass"
      :count="count"
      :has-more="hasMore"
      :is-loading="isLoading"
      @new-issue="composerOpen = true"
    />

    <IssueListToolbar
      v-model:state="state"
      v-model:search="search"
      v-model:labels="labelTitles"
      v-model:assignee="assignee"
      v-model:author="author"
      v-model:sort="sortKey"
      v-model:group="groupKey"
      v-model:scope="boardScope"
      :catalog="labelCatalog"
      :members="members ?? []"
      :active-count="activeCount"
      :view="view"
      :select-mode="selection.mode.value"
      :is-refreshing="isRefreshing"
      :scope-options="scopeOptions"
      @refresh="refresh"
      @toggle-select="toggleSelectMode"
      @set-view="setView"
      :has-custom-order="hasCustomOrder"
      @reset-order="resetOrder"
    >
      <template #saved-views>
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
      </template>
    </IssueListToolbar>

    <!-- Active filter tokens -->
    <IssueActiveFilters
      v-if="activeCount"
      :label-chips="labelChips"
      :assignee="assignee"
      :author="author"
      @remove-label="removeLabel"
      @clear-assignee="assignee = ''"
      @clear-author="author = ''"
      @clear-all="clearFilters"
    />

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
        <IssueListGroups
          v-if="view === 'list'"
          :groups="listGroups"
          :group-key="groupKey"
          :full-path="fullPath"
          :highlight-iid="highlightIid"
          :vt-name-for="vtNameFor"
          @filter="applyFacet"
          :active-key="activeKey"
          :bar-offset="barOffset"
          :pointer="pointer"
          :just-reordered="justReordered"
          :dimension="groupKey"
          :start="start"
        />

        <IssueBoard
          v-else
          :board-groups="boardGroups"
          :full-path="fullPath"
          :highlight-iid="highlightIid"
          :select-mode="selection.mode.value"
          :dragging-iid="draggingIid"
          :just-dropped="justDropped"
          :dragging="dragging"
          :vt-name-for="vtNameFor"
          :is-drop-target="isDropTarget"
          :ghost-index="ghostIndex"
          @filter="applyFacet"
          @drag-start="onDragStart"
          @drag-end="clearDrag"
          @drop="onDrop"
          @drag-over="dragOverKey = $event"
          :active-key="activeKey"
          :bar-offset="barOffset"
          :pointer="pointer"
          :just-reordered="justReordered"
          :dimension="boardScope"
          :start="start"
        />

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
      @update:open="setComposerOpen"
      @created="onCreated"
    />

    <BulkActionBar
      :count="selection.count.value"
      :catalog="labelCatalog"
      :members="members ?? []"
      :statuses="statusCatalog ?? []"
      @add-labels="onAddLabels"
      @remove-labels="onRemoveLabels"
      @set-assignee="onSetAssignee"
      @set-status="onSetStatus"
      @open-combined="onOpenCombined"
      @select-all="() => selection.selectAll(loadedIids)"
      @clear="selection.clear()"
    />
  </section>
</template>
