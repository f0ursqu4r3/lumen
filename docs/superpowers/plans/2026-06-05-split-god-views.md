# Split God Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the four oversized route views (IssueList 1072, IssueDetail 715, ProjectPicker 491, PipelineList 329) into thin orchestrators (~≤250 lines) by extracting logic into composables and template regions into child components — with zero behavior, API, or visual change.

**Architecture:** Each task extracts ONE unit (a composable, a component, or a pure helper), moving existing code verbatim into a new file behind a precise interface, then rewiring the view to consume it. Extraction is behavior-preserving, so the existing view tests are the regression gate and must pass unchanged after every task. Shared duplications are extracted first.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Vue Router, @vueuse/core, TanStack Query, Vitest, shadcn-vue, bun.

---

## How to work each task (read first)

- **Test gate is `bunx vitest run`.** NEVER `bun test` (Bun's runner — spurious failures) or `bun run test` (watch mode). Baseline: 76 files / 467 tests passing. Extractions add files; the pass count only grows or holds — it must never drop and nothing may fail.
- **Build gate (final task): `bunx vite build`** — NOT `bun run build` (it runs `vue-tsc`, expected-red until `bun codegen` produces the gitignored `src/gitlab/generated`).
- **Extraction = move, not rewrite.** When a task says "move lines A–B", preserve that code's logic AND its comments exactly. Only change what the task says to change (e.g. `props.fullPath` → a parameter, local refs → returned refs, template bindings → props/emits).
- Line numbers reference the files as they stand at plan time. If an earlier task shifted them, find the cited code by its content, not the raw number.
- After each task the view shrinks; that's expected. Do not "improve" unrelated code.
- Components live in `src/features/<domain>/components/`, composables in `src/features/<domain>/composables/` or `src/shared/composables/`, pure helpers in `src/features/<domain>/lib/`.

---

## Phase A — Shared extractions (remove duplication)

### Task 1: `useRepoPath` composable

**Files:**
- Create: `src/shared/composables/useRepoPath.ts`
- Modify: `src/views/IssueList.vue`, `src/views/IssueDetail.vue`, `src/views/PipelineList.vue`

- [ ] **Step 1: Create the composable**

```ts
// src/shared/composables/useRepoPath.ts
import { computed, type Ref } from 'vue'

// Split a project path so the final segment (the repo) reads as the name and the
// rest trails as muted context — the shared emphasis the picker/list/detail
// headers all use.
export function useRepoPath(fullPath: Ref<string>) {
  const pathParts = computed(() => fullPath.value.split('/'))
  const repoName = computed(() => pathParts.value.at(-1) ?? fullPath.value)
  const pathPrefix = computed(() => pathParts.value.slice(0, -1).join('/'))
  return { pathParts, repoName, pathPrefix }
}
```

- [ ] **Step 2: Rewire `IssueList.vue`**

Remove the local `pathParts`/`repoName`/`pathPrefix` block (currently lines 180–183) and replace with:

```ts
import { useRepoPath } from '@/shared/composables/useRepoPath'
// ...
const { repoName, pathPrefix } = useRepoPath(toRef(props, 'fullPath'))
```
(`pathParts` is only used to derive the other two — drop it. `repoName`/`pathPrefix` are used by the template and `useTitle`.)

- [ ] **Step 3: Rewire `IssueDetail.vue`**

Replace the local `repoName` (line 84) with:

```ts
import { useRepoPath } from '@/shared/composables/useRepoPath'
// ...
const { repoName } = useRepoPath(toRef(props, 'fullPath'))
```

- [ ] **Step 4: Rewire `PipelineList.vue`**

Remove `pathParts`/`repoName`/`pathPrefix` (lines 48–50) and replace with:

```ts
import { useRepoPath } from '@/shared/composables/useRepoPath'
// ...
const { repoName, pathPrefix } = useRepoPath(fullPath) // `fullPath` is the existing toRef on line 47
```

- [ ] **Step 5: Run the gate**

Run: `bunx vitest run`
Expected: PASS (≥467 tests, 0 fail).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(views): extract useRepoPath, dedupe path/title across views"
```

---

### Task 2: `useTabNav` composable

**Files:**
- Create: `src/shared/composables/useTabNav.ts`
- Modify: `src/views/IssueList.vue`, `src/views/PipelineList.vue`

- [ ] **Step 1: Create the composable**

```ts
// src/shared/composables/useTabNav.ts
import { nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { withViewTransition } from '@/shared/lib/viewTransition'

// Tab-style hops between a project's surfaces (issues ⇄ pipelines) morph the
// shared repo title and cross-fade the rest. Modified clicks fall through to the
// real href so "open in new window" still works.
export function useTabNav() {
  const router = useRouter()
  function onTabNav(e: MouseEvent, to: Parameters<typeof router.push>[0]) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    withViewTransition(async () => {
      await router.push(to)
      await nextTick()
    })
  }
  return { onTabNav }
}
```

- [ ] **Step 2: Rewire `IssueList.vue`**

Delete the local `onTabNav` function (lines 265–272). It already has `const router = useRouter()` (keep that — other code uses `router`). Add:

```ts
import { useTabNav } from '@/shared/composables/useTabNav'
// ...
const { onTabNav } = useTabNav()
```

- [ ] **Step 3: Rewire `PipelineList.vue`**

Delete the local `onTabNav` (lines 38–45). `router` is only used by `onTabNav` here, so also remove `const router = useRouter()` (line 33) and the now-unused `useRouter`/`withViewTransition`/`nextTick` imports IF nothing else references them (check: `nextTick` import on line 27 and `withViewTransition` on line 29 become unused — remove them; `useRouter` line 28 unused — remove). Add:

```ts
import { useTabNav } from '@/shared/composables/useTabNav'
// ...
const { onTabNav } = useTabNav()
```

- [ ] **Step 4: Run the gate**

Run: `bunx vitest run`
Expected: PASS (0 fail). `noUnusedLocals`/`noUnusedParameters` are on — confirm no unused-import errors surface in the vitest transform.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(views): extract useTabNav, dedupe tab morph nav"
```

---

## Phase B — IssueList.vue

### Task 3: `useIssueDrawerRoute` composable

**Files:**
- Create: `src/features/issues/composables/useIssueDrawerRoute.ts`
- Modify: `src/views/IssueList.vue`

- [ ] **Step 1: Create the composable**

Move the drawer-routing logic (IssueList lines 81–124: `drawerDirty`, `openIid`, `setDrawerOpen`, `expandIssue`) into a composable with this interface, preserving every comment and the confirm/rpc behavior:

```ts
// src/features/issues/composables/useIssueDrawerRoute.ts
import { computed, ref, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from '@/shared/composables/useConfirm'
import { rpc } from '@/shared/lib/rpc'

export function useIssueDrawerRoute(fullPath: Ref<string>) {
  const route = useRoute()
  const router = useRouter()
  const { confirm } = useConfirm()
  const drawerDirty = ref(false)

  const openIid = computed(() => {
    const q = route.query.issue
    return typeof q === 'string' && q ? q : null
  })

  async function setDrawerOpen(value: boolean) { /* move body from lines 90–101 verbatim */ }
  async function expandIssue() { /* move body from lines 104–124 verbatim, using fullPath.value */ }

  return { drawerDirty, openIid, setDrawerOpen, expandIssue }
}
```
In `expandIssue`, the only edit to the moved body: `props.fullPath` → `fullPath.value` (the rpc call on line 118).

- [ ] **Step 2: Rewire `IssueList.vue`**

Remove lines 81–124 and the now-unused locals. `route`/`router`/`confirm` stay declared in the view only if still used elsewhere — check: `route` is used by `openIid`/`setDrawerOpen` (moving out) and nowhere else → its `const route = useRoute()` (line 78) can be removed if unused after; `router` is used by other view code → keep; `confirm` is used only by the drawer fns → remove `const { confirm } = useConfirm()` (line 80) if unused after. Add:

```ts
import { useIssueDrawerRoute } from '@/features/issues/composables/useIssueDrawerRoute'
// ...
const { drawerDirty, openIid, setDrawerOpen, expandIssue } = useIssueDrawerRoute(toRef(props, 'fullPath'))
```
The template (`IssueDrawer` props/handlers, the `C`/`Escape` keystroke guards that read `openIid`) is unchanged — those names still resolve.

- [ ] **Step 3: Run the gate**

Run: `bunx vitest run`
Expected: PASS (0 fail).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(IssueList): extract useIssueDrawerRoute"
```

---

### Task 4: `useIssueBoardDnd` composable

**Files:**
- Create: `src/features/issues/composables/useIssueBoardDnd.ts`
- Modify: `src/views/IssueList.vue`

- [ ] **Step 1: Create the composable**

Move the entire drag-to-update block (IssueList lines 336–451: the `retag`/`reassign`/`setStatus` mutations, `dragging`/`draggingIid`/`dragOverKey`/`justDropped`/`dropTimer`, `buildDragGhost`, `onDragStart`, `clearDrag`, `onDrop`, `isDropTarget`, `ghostIndex`) plus its `onUnmounted(clearTimeout(dropTimer))` responsibility. Interface:

```ts
// src/features/issues/composables/useIssueBoardDnd.ts
import { ref, onUnmounted, type Ref } from 'vue'
import type { IssueListItem } from '@/features/issues/composables/useIssues'
import { useRetagIssue, useReassignIssue } from '@/features/issues/composables/useIssueMutations'
import { useSetIssueStatus, type WorkItemStatus } from '@/features/issues/composables/useWorkItemStatus'
import { boardDropIndex, planBoardMove, type IssueGroup } from '@/features/issues/lib/issueView'

interface Member { id: string; name: string; username: string; avatarUrl?: string | null }

export function useIssueBoardDnd(opts: {
  fullPath: string
  boardScope: Ref<string>
  sortKey: Ref<string>
  statusCatalog: Ref<WorkItemStatus[] | undefined>
  members: Ref<Member[] | undefined>
}) {
  const retag = useRetagIssue(opts.fullPath)
  const reassign = useReassignIssue(opts.fullPath)
  const setStatus = useSetIssueStatus(opts.fullPath)
  const dragging = ref<IssueListItem | null>(null)
  const draggingIid = ref<string | null>(null)
  const dragOverKey = ref<string | null>(null)
  const justDropped = ref<string | null>(null)
  let dropTimer: ReturnType<typeof setTimeout> | undefined
  // move buildDragGhost / onDragStart / clearDrag / onDrop / isDropTarget / ghostIndex
  // verbatim from lines 352–451, replacing `boardScope.value`→`opts.boardScope.value`,
  // `sortKey.value`→`opts.sortKey.value`, `statusCatalog.value`→`opts.statusCatalog.value`,
  // `members.value`→`opts.members.value`.
  onUnmounted(() => clearTimeout(dropTimer))
  return { dragging, draggingIid, dragOverKey, justDropped, onDragStart, clearDrag, onDrop, isDropTarget, ghostIndex }
}
```
Confirm the `Member` shape matches what `useProjectMembers` returns (it's used to build the optimistic assignee node); if the real type is exported, import it instead of redeclaring.

- [ ] **Step 2: Rewire `IssueList.vue`**

Remove lines 336–451. Remove `retag`/`reassign`/`setStatus`/`useRetagIssue`/`useReassignIssue`/`useSetIssueStatus` declarations that moved (the imports for `useRetagIssue`/`useReassignIssue` line 24 and `useSetIssueStatus` line 27 are now only used by the composable — remove from the view). Keep `boardDropIndex`/`planBoardMove` import only if still used in the view; they moved, so drop them from the view's `issueView` import (keep the others it still uses: `sortIssues, groupIssues, boardColumns, labelScopes, SORTS, GROUPS, BOARD_GROUPS, Facet, IssueGroup`). Remove the `clearTimeout(dropTimer)` from the view's `onUnmounted` (line 496) — the composable owns it now; keep `clearTimeout(highlightTimer)`. Add:

```ts
import { useIssueBoardDnd } from '@/features/issues/composables/useIssueBoardDnd'
// ...
const { dragging, draggingIid, dragOverKey, justDropped, onDragStart, clearDrag, onDrop, isDropTarget, ghostIndex } =
  useIssueBoardDnd({
    fullPath: props.fullPath,
    boardScope,
    sortKey,
    statusCatalog,
    members,
  })
```

- [ ] **Step 3: Run the gate**

Run: `bunx vitest run`
Expected: PASS (0 fail).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(IssueList): extract useIssueBoardDnd"
```

---

### Task 5: `IssueActiveFilters.vue` component

**Files:**
- Create: `src/features/issues/components/IssueActiveFilters.vue`
- Modify: `src/views/IssueList.vue`

- [ ] **Step 1: Create the component**

Move the active-filter token row (IssueList template lines 797–852) into a component. Props/emits:

```ts
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
```
Move the template verbatim (the outer `v-if="activeCount"` wrapper stays in the view; the component renders the inner content unconditionally OR accepts an `activeCount`/renders nothing when empty — keep it simple: the component contains lines 798–851's inner markup, and the parent guards with `v-if`). Rewire handlers: `removeLabel(l.title)` → `$emit('remove-label', l.title)`; `assignee = ''` → `$emit('clear-assignee')`; `author = ''` → `$emit('clear-author')`; `clearFilters` → `$emit('clear-all')`. Import `LabelChip` and the `X` icon into the component. Keep the `TransitionGroup name="facet"` and all classes exactly.

- [ ] **Step 2: Rewire `IssueList.vue`**

Replace template lines 797–852 with:

```html
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
```
Add `import IssueActiveFilters from '@/features/issues/components/IssueActiveFilters.vue'`. Remove the now-unused `LabelChip` and `X` imports from the view IF nothing else uses them (search the remaining template — `X` and `LabelChip` only appeared in this block; remove both). `labelChips`, `removeLabel`, `clearFilters`, `applyFacet` stay in the view.

- [ ] **Step 3: Run the gate**

Run: `bunx vitest run`
Expected: PASS (0 fail).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(IssueList): extract IssueActiveFilters"
```

---

### Task 6: `IssueListToolbar.vue` component

**Files:**
- Create: `src/features/issues/components/IssueListToolbar.vue`
- Modify: `src/views/IssueList.vue`

- [ ] **Step 1: Create the component**

Move both toolbar rows (IssueList template lines 600–795: row 1 state/search/filter/saved-views/refresh/select/view-toggle, and row 2 list-sort/group + board-sort/columns). The component owns the segmented controls and Selects; it communicates via v-model on the shared refs and a few events. Interface:

```ts
import type { IssueFilters } from '@/gitlab/issueParams'
type StateValue = NonNullable<IssueFilters['state']>
defineProps<{
  // catalog/members for the filter panel
  catalog: { id: string; title: string; color: string }[]
  members: { id: string; name: string; username: string; avatarUrl?: string | null }[]
  activeCount: number
  // saved views
  savedViews: { id: string; name: string; query: Record<string, unknown> }[]
  activeViewId: string | null
  loadedViewId: string | null
  canSaveView: boolean
  // toolbar state
  view: 'list' | 'board'
  selectMode: boolean
  isRefreshing: boolean
  scopeOptions: string[]
}>()
const state = defineModel<StateValue>('state', { required: true })
const search = defineModel<string>('search', { required: true })
const labels = defineModel<string[]>('labels', { required: true })
const assignee = defineModel<string>('assignee', { required: true })
const author = defineModel<string>('author', { required: true })
const sortKey = defineModel<string>('sort', { required: true })
const groupKey = defineModel<string>('group', { required: true })
const boardScope = defineModel<string>('scope', { required: true })
defineEmits<{ refresh: []; 'toggle-select': []; 'set-view': [next: 'list' | 'board'] }>()
```
Move the markup verbatim, rewiring: the `STATES` constant (lines 174–178) moves into this component; `@click="state = s.value"` keeps working via the `state` model; `@click="setView('list'|'board')"` → `$emit('set-view', 'list'|'board')`; `@click="refresh"` → `$emit('refresh')`; `@click="toggleSelectMode"` → `$emit('toggle-select')`; `selection.mode.value` (used for the select toggle `aria-pressed`/class) → the `selectMode` prop. The `SavedViews` sub-events (`apply`/`save`/`update`/`rename`/`remove`) re-emit upward — simplest: keep `SavedViews` in the PARENT, not here. To avoid threading 5 saved-view events, **leave the `<SavedViews>` element in the view** and only move the rest of the toolbar. Adjust: this component renders row 1 minus `SavedViews` and row 2; the view places `<SavedViews>` adjacent. (Pick whichever keeps bindings simplest; document the choice in the component header comment.)
Import into the component: the lucide icons it uses (`Search, RefreshCw, CheckSquare, List, Columns3`), `Input`, `Button`, `IssueFilterPanel`, and the `Select*` family, `SORTS`/`GROUPS`/`BOARD_GROUPS` from `issueView`.

- [ ] **Step 2: Rewire `IssueList.vue`**

Replace lines 600–795 with `<IssueListToolbar ... />` binding all the models + props + the three events (`@refresh="refresh"`, `@toggle-select="toggleSelectMode"`, `@set-view="setView"`), and place `<SavedViews>` where the design chose. Remove now-unused imports from the view (`Search, RefreshCw, CheckSquare, List, Columns3, Input` if unused elsewhere — note `Search` is also used in empty states lines 1029; keep it; `Plus` stays; re-check each). Remove the `STATES` const and `StateValue` type from the view (moved). Keep `state/search/labelTitles/assignee/author/sortKey/groupKey/boardScope/view/activeCount/scopeOptions/labelCatalog/members/savedViews/isRefreshing/selection` in the view.

- [ ] **Step 3: Run the gate**

Run: `bunx vitest run`
Expected: PASS (0 fail). If `IssueList.test.ts` queries toolbar controls (state buttons, view toggle, refresh, select-mode by `data-testid`), those testids moved into the component but still render under the view — they must still be found. If any fail, the binding/testid was dropped — restore it.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(IssueList): extract IssueListToolbar"
```

---

### Task 7: `IssueBoard.vue` component

**Files:**
- Create: `src/features/issues/components/IssueBoard.vue`
- Modify: `src/views/IssueList.vue`

- [ ] **Step 1: Create the component**

Move the board region (IssueList template lines 904–1007: the full-bleed scroll container, the `boardTopEl` sentinel, columns from `boardGroups`, per-card draggable wrapper, ghost, empty lane). Interface:

```ts
import type { IssueListItem } from '@/features/issues/composables/useIssues'
import type { IssueGroup } from '@/features/issues/lib/issueView'
defineProps<{
  boardGroups: IssueGroup[]
  boardStyle: Record<string, string>
  fullPath: string
  highlightIid: string | null
  selectMode: boolean
  draggingIid: string | null
  justDropped: string | null
  dragging: IssueListItem | null
  vtNameFor: (iid: string) => string | undefined
  isDropTarget: (g: IssueGroup) => boolean
  ghostIndex: (g: IssueGroup) => number
}>()
defineEmits<{
  filter: [f: import('@/features/issues/lib/issueView').Facet]
  'drag-start': [issue: IssueListItem, e: DragEvent]
  'drag-end': []
  'drop': [g: IssueGroup]
  'drag-over': [key: string]
}>()
```
Move markup verbatim. Rewire: `boardTopEl` must stay measured by the VIEW (its `boardStyle` depends on the measured top). Keep the `<span ref="boardTopEl">` sentinel + `useElementBounding` + `boardStyle` in the VIEW, and pass `boardStyle` down — BUT the sentinel sits inside the scroll container being moved. Resolve by: keep the sentinel inside `IssueBoard` and emit its element up via `defineExpose`/a template ref prop. Simplest robust approach: pass a `boardTopEl` ref down as a prop and bind it in the component (`:ref`), OR move the `useElementBounding`+`boardStyle` computation INTO `IssueBoard` and have the component own its own height. **Chosen: move board sizing into `IssueBoard`** — it owns `boardTopEl`, `useElementBounding`, and `boardStyle` internally (delete the `boardStyle` prop above; drop those lines from the view). This keeps the measurement next to the element it measures. Card drag handlers: `@dragstart` → `$emit('drag-start', issue, $event)`, `@dragend` → `$emit('drag-end')`, `@dragover/@dragenter` → `$emit('drag-over', g.key)`, `@drop` → `$emit('drop', g)`, `@filter` on `IssueCard` → `$emit('filter', $event)`. `selection.mode.value` → `selectMode` prop. Import `IssueCard`, `GripVertical`.

- [ ] **Step 2: Rewire `IssueList.vue`**

Replace lines 904–1007 with:

```html
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
/>
```
(The `v-else` pairs with the list-view `v-if="view === 'list'"` block above it.) Delete the view's `boardTopEl`, `useElementBounding` usage, and `boardStyle` (lines 230–234) since they moved; remove the `useElementBounding` import if now unused. Remove `IssueCard`/`GripVertical` imports from the view if unused elsewhere (IssueCard is only used in the board → remove; `GripVertical` only in board → remove).

- [ ] **Step 3: Run the gate**

Run: `bunx vitest run`
Expected: PASS (0 fail).

- [ ] **Step 4: Verify IssueList size + commit**

```bash
wc -l src/views/IssueList.vue   # expect roughly ≤300
git add -A
git commit -m "refactor(IssueList): extract IssueBoard; view is now a thin orchestrator"
```

---

## Phase C — IssueDetail.vue

### Task 8: `useIssueLinks` + `IssueMasthead.vue`

**Files:**
- Create: `src/features/issues/composables/useIssueLinks.ts`, `src/features/issues/components/IssueMasthead.vue`
- Modify: `src/views/IssueDetail.vue`

- [ ] **Step 1: Create `useIssueLinks`**

Move copy-link + open-in-gitlab (IssueDetail lines 113–135 + `openInGitLab` 118–120):

```ts
// src/features/issues/composables/useIssueLinks.ts
import { ref, type Ref } from 'vue'
import { rpc } from '@/shared/lib/rpc'

type IssueLike = { iid: string; title: string; webUrl: string } | null | undefined

export function useIssueLinks(issue: Ref<IssueLike>) {
  const linkCopied = ref<null | 'url' | 'md'>(null)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined
  async function openInGitLab() { /* move lines 118–120, using issue.value */ }
  async function onCopyClick(e: MouseEvent) { /* move lines 125–135, using issue.value */ }
  return { linkCopied, onCopyClick, openInGitLab }
}
```

- [ ] **Step 2: Create `IssueMasthead.vue`**

Move the masthead `<header>` (IssueDetail template lines 321–417: back-link/eyebrow, `StateBadge`, id chip, copy button, open-in-gitlab, close/reopen, editable title, byline). Interface:

```ts
defineProps<{
  issue: { iid: string; title: string; author?: { name?: string | null; username: string } | null; createdAt: string; webUrl: string }
  repoName: string
  state: string            // draft.state
  embedded?: boolean
  windowed?: boolean
  linkCopied: null | 'url' | 'md'
}>()
const draftTitle = defineModel<string>('title', { required: true })   // binds draft.title in the Input
const editingTitle = defineModel<boolean>('editingTitle', { required: true })
defineEmits<{ copy: [e: MouseEvent]; 'open-external': []; 'toggle-state': [] }>()
```
Move markup verbatim; rewire `draft.title`→`draftTitle`, `draft.state`→`state` prop, `editingTitle`→model, `onCopyClick`→`$emit('copy', $event)`, `openInGitLab`→`$emit('open-external')`, `toggleState`→`$emit('toggle-state')`, `nameOrUsername`→keep a local copy of that helper in the component (it's tiny; or import from a shared util — keep local). Import `StateBadge`, `EditableField`, `Button`, `Input`, the icons (`Check, Link, ExternalLink, ArrowLeft`).

- [ ] **Step 3: Rewire `IssueDetail.vue`**

Replace header lines 321–417 with `<IssueMasthead>` binding `:issue`, `:repo-name`, `:state="draft.state"`, `:embedded`, `:windowed`, `:link-copied="linkCopied"`, `v-model:title="draft.title"`, `v-model:editing-title="editingTitle"`, `@copy="onCopyClick"`, `@open-external="openInGitLab"`, `@toggle-state="toggleState"`. Replace the inline copy/gitlab logic with `const { linkCopied, onCopyClick, openInGitLab } = useIssueLinks(issue)`. Keep `toggleState`, `editingTitle`, `nameOrUsername` (still used in discussion area until Task 10), `repoName`. Remove now-unused icon imports from the view if they only appeared in the header.

- [ ] **Step 4: Gate + commit**

Run: `bunx vitest run` → PASS (0 fail).
```bash
git add -A && git commit -m "refactor(IssueDetail): extract IssueMasthead + useIssueLinks"
```

---

### Task 9: `useIssueMediaViewer` composable

**Files:**
- Create: `src/features/issues/composables/useIssueMediaViewer.ts`
- Modify: `src/views/IssueDetail.vue`

- [ ] **Step 1: Create the composable**

Move media list + viewer (IssueDetail lines 104–111 + `onBodyMediaClick` 141–150):

```ts
// src/features/issues/composables/useIssueMediaViewer.ts
import { computed, ref, type Ref } from 'vue'
import { buildIssueMedia } from '@/features/issues/composables/useIssueMedia'

export function useIssueMediaViewer(opts: {
  description: Ref<string | undefined>
  notes: Ref<{ id: string; body: string }[]>   // match the note shape used by buildIssueMedia
  fullPath: string
}) {
  const media = computed(() => buildIssueMedia(opts.description.value, opts.notes.value, opts.fullPath))
  const viewerOpen = ref(false)
  const viewerIndex = ref(0)
  function openViewer(i: number) { viewerIndex.value = i; viewerOpen.value = true }
  function onBodyMediaClick(e: MouseEvent) { /* move lines 141–150 verbatim */ }
  return { media, viewerOpen, viewerIndex, openViewer, onBodyMediaClick }
}
```
Verify the exact arg types `buildIssueMedia` expects and mirror them in `opts` (the real `notes` element type from the view's `notes` computed).

- [ ] **Step 2: Rewire `IssueDetail.vue`**

Remove lines 104–111 and 141–150. Add:

```ts
import { useIssueMediaViewer } from '@/features/issues/composables/useIssueMediaViewer'
// ...
const { media, viewerOpen, viewerIndex, openViewer, onBodyMediaClick } = useIssueMediaViewer({
  description: computed(() => draft.value?.description),
  notes,
  fullPath: props.fullPath,
})
```
Template references (`@click="onBodyMediaClick"`, `openViewer(0)`, `MediaViewer` v-model) are unchanged.

- [ ] **Step 3: Gate + commit**

Run: `bunx vitest run` → PASS (0 fail).
```bash
git add -A && git commit -m "refactor(IssueDetail): extract useIssueMediaViewer"
```

---

### Task 10: `useIssueDiscussion` + `IssueDiscussion.vue`

**Files:**
- Create: `src/features/issues/composables/useIssueDiscussion.ts`, `src/features/issues/components/IssueDiscussion.vue`
- Modify: `src/views/IssueDetail.vue`

- [ ] **Step 1: Create `useIssueDiscussion`**

Move reply state + fresh-note tracker (IssueDetail lines 152–212):

```ts
// src/features/issues/composables/useIssueDiscussion.ts
import { computed, ref, watch, type Ref } from 'vue'
import { useAddNote } from '@/features/issues/composables/useIssueMutations'

export function useIssueDiscussion(opts: {
  fullPath: string
  iid: string
  issue: Ref<{ id: string } | null | undefined>
  notes: Ref<{ id: string }[]>
}) {
  const fresh = ref(new Set<string>())
  // move the seen/primed watch from lines 157–182 verbatim (using opts.issue/opts.notes)
  const reply = useAddNote(opts.fullPath, opts.iid)
  const replyingTo = ref<string | null>(null)
  const replyBody = ref('')
  const replyPending = computed(() => reply.isPending.value)
  const replyError = computed(() => reply.error.value)
  // move openReply / cancelReply / submitReply from lines 194–212 verbatim (using opts.issue)
  return { fresh, replyingTo, replyBody, replyPending, replyError, openReply, cancelReply, submitReply }
}
```

- [ ] **Step 2: Create `IssueDiscussion.vue`**

Move the discussion `<section>` (IssueDetail template lines 503–601: threads/notes list, per-thread reply box, the "Add a comment" field). Interface:

```ts
defineProps<{
  threads: { id: string; notes: { id: string; body: string; author?: { name?: string | null; username: string } | null; createdAt: string }[] }[]
  notes: { id: string }[]
  fullPath: string
}>()
const comment = defineModel<string>('comment', { required: true })
// uses useIssueDiscussion internally:
const { fresh, replyingTo, replyBody, replyPending, replyError, openReply, cancelReply, submitReply } =
  useIssueDiscussion({ fullPath: props.fullPath, iid: props.iid /* add iid + issue props */ })
```
This component needs `iid` and the `issue` ref for `useIssueDiscussion`. Add `iid: string` and `issue` to its props. Move the `nameOrUsername`/`initials` helpers (lines 220–228) into this component (they're only used in the discussion + masthead byline — masthead got its own copy in Task 8, so the view no longer needs them after this task). Import `Avatar`, `AvatarFallback`, `MarkdownText`, `Button`, `Textarea`, `ErrorNotice`.

- [ ] **Step 3: Rewire `IssueDetail.vue`**

Replace template lines 503–601 with `<IssueDiscussion :threads="threads" :notes="notes" :iid="iid" :issue="issue" :full-path="fullPath" v-model:comment="comment" />`. Remove the moved script (lines 152–212, the `nameOrUsername`/`initials` helpers if now unused in the view — `nameOrUsername` is still used by the byline? No — byline moved to masthead in Task 8. Confirm and remove). Keep `threads`/`notes` computeds in the view (passed to both this component and the media viewer). Remove the `useAddNote` import from the view (moved).

- [ ] **Step 4: Gate + commit**

Run: `bunx vitest run` → PASS (0 fail). If `IssueDetail.test.ts` exercises replies/notes by testid (`note`, reply buttons), they now render under `IssueDiscussion` within the view — must still be found.
```bash
git add -A && git commit -m "refactor(IssueDetail): extract IssueDiscussion + useIssueDiscussion"
```

---

### Task 11: `IssueDetailsRail.vue`

**Files:**
- Create: `src/features/issues/components/IssueDetailsRail.vue`
- Modify: `src/views/IssueDetail.vue`

- [ ] **Step 1: Create the component**

Move the details rail `<aside>` (IssueDetail template lines 462–501) AND the label id↔title conversion (lines 56–69) AND status resolution (lines 71–78). Interface:

```ts
import { computed } from 'vue'
import type { WorkItemStatus } from '@/features/issues/composables/useWorkItemStatus'
const props = defineProps<{
  issue: { milestone?: { title: string } | null }
  members: { id: string; name: string; username: string; avatarUrl?: string | null }[]
  contributors: unknown[]
  catalog: { id: string; title: string; color: string }[]
  statusOptions: WorkItemStatus[]
}>()
const draftLabelIds = defineModel<string[]>('labelIds', { required: true })
const draftStatusId = defineModel<string | undefined>('statusId', { required: true })
const draftAssignees = defineModel<string[]>('assigneeUsernames', { required: true })
// draftLabelTitles get/set computed (move lines 58–69), currentStatus + onSelectStatus (71–78)
```
Bind `LabelPicker v-model="draftLabelTitles"`, `StatusPicker :current="currentStatus" @select="onSelectStatus"`, `AssigneeEditor`/`QuickAssign v-model:usernames="draftAssignees"`, milestone text from `issue.milestone`. Import `StatusPicker`, `LabelPicker`, `AssigneeEditor`, `QuickAssign`.

- [ ] **Step 2: Rewire `IssueDetail.vue`**

Replace template lines 462–501 with:
```html
<IssueDetailsRail
  :issue="issue"
  :members="members ?? []"
  :contributors="contributors ?? []"
  :catalog="catalog"
  :status-options="statusOptions ?? []"
  v-model:label-ids="draft.labelIds"
  v-model:status-id="draft.statusId"
  v-model:assignee-usernames="draft.assigneeUsernames"
/>
```
Remove the moved script (lines 56–78: `catalog` computed stays only if used elsewhere — it's used by `draftLabelTitles` which moved, so move `catalog` into the component too; `draftLabelTitles`, `currentStatus`, `onSelectStatus` all move). Remove now-unused imports from the view (`StatusPicker`, `LabelPicker`, `AssigneeEditor`, `QuickAssign`).

- [ ] **Step 3: Gate + commit**

Run: `bunx vitest run` → PASS (0 fail).
```bash
git add -A && git commit -m "refactor(IssueDetail): extract IssueDetailsRail"
```

---

### Task 12: `IssueDetailSkeleton.vue`

**Files:**
- Create: `src/features/issues/components/IssueDetailSkeleton.vue`
- Modify: `src/views/IssueDetail.vue`

- [ ] **Step 1: Create the component**

Move the loading skeleton block (IssueDetail template lines 270–318) verbatim into a component with no props. Import `Skeleton`. The component's root is the `<div class="issue" role="status" aria-busy="true">…</div>`. NOTE: the skeleton uses the `.issue`/`.issue__*` classes defined in the view's scoped `<style>`; copy the relevant `.issue`, `.issue__body`, grid styles into this component's own scoped `<style>` (duplicate the needed rules — skeleton + article both need them; keep the article's copy in the view). Simplest: copy the ENTIRE `<style>` block into the skeleton component too (it's layout-only, harmless duplication) — or, cleaner, leave the skeleton markup using a minimal local style. **Chosen:** copy the `.issue` container + `.issue__body` grid rules the skeleton references into the skeleton's scoped style.

- [ ] **Step 2: Rewire `IssueDetail.vue`**

Replace lines 270–318 with `<IssueDetailSkeleton v-else-if="isLoading" />`. Remove `Skeleton` import from the view if now unused (the article no longer uses it — confirm; remove).

- [ ] **Step 3: Verify size + gate + commit**

```bash
wc -l src/views/IssueDetail.vue   # expect roughly ≤260
bunx vitest run                    # PASS (0 fail)
git add -A && git commit -m "refactor(IssueDetail): extract IssueDetailSkeleton; thin orchestrator"
```

---

## Phase D — ProjectPicker.vue

### Task 13: `useSpringCursor` (shared) + wire

**Files:**
- Create: `src/shared/composables/useSpringCursor.ts`
- Modify: `src/views/ProjectPicker.vue`

- [ ] **Step 1: Create the composable**

Move the spring-rail logic (ProjectPicker lines 59–134: `active`, `listEl`, `reduce`, `cursor`, `velocity`/`raf`/`lastTs`, `rowAt`, `springTo`, `move`, and the three `watch`es on `active`/`search`/`flatRows`, plus `pinTo`). Generalize it to not know about projects: it takes a count ref, a way to find row elements, and the search/rows reactivity hooks it needs. Interface:

```ts
// src/shared/composables/useSpringCursor.ts
import { reactive, ref, watch, nextTick, type Ref } from 'vue'

export function useSpringCursor(opts: {
  count: Ref<number>
  listEl: Ref<HTMLElement | null>
  // re-snap triggers:
  resetKey: Ref<unknown>      // e.g. the search string — changing it resets to top + snaps
  rows: Ref<{ fullPath: string }[]>  // the flat row list, to pin/clamp on change
}) {
  const active = ref(0)
  const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  const cursor = reactive({ y: 0, h: 0, visible: false })
  const pinTo = ref<string | null>(null)
  // move rowAt/springTo/move verbatim (rowAt uses opts.listEl, count uses opts.count)
  // move the three watches verbatim (watch opts.resetKey instead of `search`, opts.rows instead of `flatRows`)
  return { active, cursor, pinTo, springTo, move }
}
```
Keep the spring constants and comments. `rowAt` reads `[data-row]` under `opts.listEl`.

- [ ] **Step 2: Rewire `ProjectPicker.vue`**

Remove lines 59–134. Add:
```ts
import { useSpringCursor } from '@/shared/composables/useSpringCursor'
// ...
const listEl = ref<HTMLElement | null>(null)
const { active, cursor, pinTo, springTo, move } = useSpringCursor({
  count,
  listEl,
  resetKey: search,
  rows: flatRows,
})
```
`onMounted`/`onBeforeUnmount` still call `springTo(true)` and must still `cancelAnimationFrame` — the raf handle now lives in the composable, so move the `cancelAnimationFrame(raf)` cleanup INTO the composable via `onScopeDispose`/`onBeforeUnmount` inside it (add that to Step 1). The view's `onBeforeUnmount` keeps only the `removeEventListener('keydown', …)`. Keep `launch`/`navigate`/`onRowClick`/`onToggleStar`/`onKeydown` and the infinite-load block in the view.

- [ ] **Step 3: Gate + commit**

Run: `bunx vitest run` → PASS (0 fail). `ProjectPicker.test.ts` likely drives arrow/enter/star — keyboard stays in the view, cursor moved; both must still work together.
```bash
git add -A && git commit -m "refactor(ProjectPicker): extract useSpringCursor to shared"
```

---

### Task 14: `ProjectRow.vue`

**Files:**
- Create: `src/features/projects/components/ProjectRow.vue`
- Modify: `src/views/ProjectPicker.vue`

- [ ] **Step 1: Create the component**

Move one launcher `<RouterLink data-row …>` row (ProjectPicker template lines 357–444: monogram, name + namespace, assigned count, star toggle, Enter affordance, quick-jump keycap). Interface:

```ts
import type { BrowserRow } from '@/features/projects/composables/useProjectBrowser'
defineProps<{
  row: BrowserRow
  index: number
  active: boolean
  nameStyle?: { viewTransitionName: string }
}>()
defineEmits<{
  'row-click': [e: MouseEvent]
  'toggle-star': []
  activate: []   // mouseenter/focus → parent sets active = index
}>()
```
Move markup verbatim; rewire `i === active`→`active` prop, `@mouseenter="active = i"`/`@focus="active = i"`→`$emit('activate')`, `@click="onRowClick($event, row, i)"`→`$emit('row-click', $event)`, `@click.stop.prevent="onToggleStar(row)"`→`$emit('toggle-star')`, `:style="nameStyle(row)"`→`:style="nameStyle"`, keep `monogram`/`namespace` as local helpers in the component (move lines 44–52 into it). Import `Star`, `CornerDownLeft`.

- [ ] **Step 2: Rewire `ProjectPicker.vue`**

Replace the `<RouterLink data-row …>…</RouterLink>` (lines 357–444) with:
```html
<ProjectRow
  :row="row"
  :index="i"
  :active="i === active"
  :name-style="nameStyle(row)"
  @row-click="onRowClick($event, row, i)"
  @toggle-star="onToggleStar(row)"
  @activate="active = i"
/>
```
(Keep the surrounding `<template v-for>` + section header in the view; only the row element moves.) Remove now-unused `monogram`/`namespace` from the view (moved) and the `Star`/`CornerDownLeft` imports if unused elsewhere (Star is also used in the section header line 342 — keep it; `CornerDownLeft` only in the row — remove).

- [ ] **Step 3: Verify size + gate + commit**

```bash
wc -l src/views/ProjectPicker.vue   # expect roughly ≤260
bunx vitest run                      # PASS (0 fail)
git add -A && git commit -m "refactor(ProjectPicker): extract ProjectRow"
```

---

## Phase E — PipelineList.vue

### Task 15: `pipelineFormat.ts` (pure helpers + unit test)

**Files:**
- Create: `src/features/pipelines/lib/pipelineFormat.ts`, `src/features/pipelines/lib/pipelineFormat.test.ts`
- Modify: `src/views/PipelineList.vue`

- [ ] **Step 1: Write the failing unit test**

```ts
// src/features/pipelines/lib/pipelineFormat.test.ts
import { describe, it, expect } from 'vitest'
import { formatDuration, shortSha, timeAgo } from '@/features/pipelines/lib/pipelineFormat'

describe('pipelineFormat', () => {
  it('formatDuration: null → empty, sub-minute → seconds, else m s', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(125)).toBe('2m 5s')
  })
  it('shortSha: first 8 chars, null → empty', () => {
    expect(shortSha('0123456789abcdef')).toBe('01234567')
    expect(shortSha(null)).toBe('')
  })
  it('timeAgo: returns a relative string for a recent time', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(timeAgo(fiveMinAgo)).toMatch(/minute/)
  })
})
```

- [ ] **Step 2: Run it (fails — module missing)**

Run: `bunx vitest run src/features/pipelines/lib/pipelineFormat.test.ts`
Expected: FAIL (cannot resolve `pipelineFormat`).

- [ ] **Step 3: Create the helpers**

Move PipelineList lines 68 (`shortSha`), 85–90 (`formatDuration`), 92–105 (`RELATIVE`/`UNITS`/`timeAgo`), 107–111 (`timing`) into:

```ts
// src/features/pipelines/lib/pipelineFormat.ts
import { isActivePipeline } from '@/gitlab/pipelineParams'
import type { Pipeline } from '@/features/pipelines/composables/usePipelines'

export const shortSha = (sha: string | null) => sha?.slice(0, 8) ?? ''

export function formatDuration(seconds: number | null): string { /* move lines 85–90 verbatim */ }

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400], ['hour', 3_600], ['minute', 60], ['second', 1],
]
export function timeAgo(iso: string): string { /* move lines 99–105 verbatim */ }

export function timing(p: Pipeline): string { /* move lines 107–111 verbatim */ }
```

- [ ] **Step 4: Run the test (passes)**

Run: `bunx vitest run src/features/pipelines/lib/pipelineFormat.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire `PipelineList.vue`**

Remove the moved helper definitions (lines 68, 85–111) and add `import { formatDuration, shortSha, timeAgo, timing } from '@/features/pipelines/lib/pipelineFormat'`. (`formatDuration`/`timeAgo` are only used by `timing` — if the template only calls `timing`/`shortSha`, import just those two. Check the template: it uses `timing(p)` and `shortSha(p.sha)`. Import `{ shortSha, timing }` only; `formatDuration`/`timeAgo` stay internal to the lib.) Remove the now-unused `isActivePipeline` import from the view ONLY if `activeCount`/the template no longer use it — they do (`activeCount` line 66, template watch-bell `v-if`), so keep `isActivePipeline` in the view.

- [ ] **Step 6: Full gate + commit**

Run: `bunx vitest run` → PASS (≥470 now, 0 fail).
```bash
git add -A && git commit -m "refactor(PipelineList): extract pure pipelineFormat helpers + tests"
```

---

### Task 16: `PipelineRow.vue`

**Files:**
- Create: `src/features/pipelines/components/PipelineRow.vue`
- Modify: `src/views/PipelineList.vue`

- [ ] **Step 1: Create the component**

Move one `<li>` row (PipelineList template lines 207–326: header/expand-toggle, status badge, branch/sha, stage dots, timing, user avatar, watch-bell, open-in-gitlab, expandable stepper). Interface:

```ts
import type { Pipeline } from '@/features/pipelines/composables/usePipelines'
defineProps<{
  pipeline: Pipeline
  index: number
  open: boolean
  watched: boolean
  canWatch: boolean        // isActivePipeline(p.status)
  href: string | null      // toAbsolute(p.path); disables open button when null
}>()
defineEmits<{ 'toggle-open': []; 'toggle-watch': []; open: [] }>()
```
Move markup verbatim; rewire `isOpen(p.id)`→`open` prop, `watchStore.isWatched(p.id)`→`watched`, `isActivePipeline(p.status)`→`canWatch`, `toAbsolute(p.path)`→`href`, `toggleOpen(p.id)`→`$emit('toggle-open')`, `watchStore.toggle(p.id)`→`$emit('toggle-watch')`, `openPipeline(p)`→`$emit('open')`, `rowDelay(i)`→keep a local `rowDelay` helper (move line 73) or compute from `index` prop. Import `PipelineStatusBadge`, `PipelineStages`, `PipelineStageDots`, `AssigneeAvatar`, `Button`, the icons (`GitBranch, ExternalLink, Bell, BellRing, ChevronRight`), and `{ shortSha, timing }` from `pipelineFormat`. Keep the `bell-listening`/`animate-status` classes. NOTE: if `bell-listening` is defined in `styles.css` (global) it just works; if it's scoped to the view, move that rule into this component's scoped style.

- [ ] **Step 2: Rewire `PipelineList.vue`**

Replace the `<li>` (lines 207–326) with:
```html
<PipelineRow
  v-for="(p, i) in pipelines"
  :key="p.id"
  :pipeline="p"
  :index="i"
  :open="isOpen(p.id)"
  :watched="watchStore.isWatched(p.id)"
  :can-watch="isActivePipeline(p.status)"
  :href="toAbsolute(p.path)"
  @toggle-open="toggleOpen(p.id)"
  @toggle-watch="watchStore.toggle(p.id)"
  @open="openPipeline(p)"
/>
```
(Keep the `<ul>` wrapper + watched-ring class on the row? The ring class `ring-1 ring-primary/20` was on the `<li>` — move it into `PipelineRow`'s root keyed off `watched`.) Remove now-unused imports from the view: the icons/components that only appeared in the row (`GitBranch, ExternalLink, Bell, BellRing, ChevronRight, PipelineStatusBadge, PipelineStages, PipelineStageDots, AssigneeAvatar`, `shortSha`/`timing`). Keep `usePipelines`, watch/notifications wiring, `activeCount`, `isActivePipeline`, `toAbsolute`, `expanded`/`isOpen`/`toggleOpen`, `openPipeline`, `rowDelay` is gone from the view (moved). Keep header icons (`ArrowLeft, RefreshCw, LoaderCircle, BellRing` — note BellRing is used in the header "watching" badge line 160, so KEEP `BellRing` in the view).

- [ ] **Step 3: Verify size + gate + commit**

```bash
wc -l src/views/PipelineList.vue   # expect roughly ≤170
bunx vitest run                     # PASS (0 fail)
git add -A && git commit -m "refactor(PipelineList): extract PipelineRow; thin orchestrator"
```

---

## Task 17: Final verification

**Files:** none (verification only)

- [ ] **Step 1: All views under target**

```bash
wc -l src/views/IssueList.vue src/views/IssueDetail.vue src/views/ProjectPicker.vue src/views/PipelineList.vue
```
Expected: each roughly ≤280 (IssueList), ≤260 (IssueDetail), ≤260 (ProjectPicker), ≤170 (PipelineList). If one is still well over, an extraction was skipped — revisit.

- [ ] **Step 2: Full test gate**

Run: `bunx vitest run`
Expected: PASS, 0 fail, count ≥ 470 (original 467 + new pipelineFormat cases).

- [ ] **Step 3: Build gate**

Run: `bunx vite build`
Expected: completes, no "failed to resolve import" / "Could not resolve" errors.

- [ ] **Step 4: Manual smoke**

Launch the app and confirm no console errors and unchanged behavior on: project picker (keyboard nav + spring rail + star + launch morph), issue list (toolbar, list/board toggle, board drag-to-update, filters, drawer, bulk bar), issue detail (edit title/desc, status/labels/assignees, replies, media viewer, save bar), pipelines (expand row, watch bell, refresh).

---

## Self-Review

- **Spec coverage:** Shared `useRepoPath`/`useTabNav`/`useSpringCursor` → Tasks 1, 2, 13. IssueList 5 extractions → Tasks 3–7. IssueDetail 7 units (Masthead+useIssueLinks, useIssueMediaViewer, Discussion+useIssueDiscussion, DetailsRail, Skeleton) → Tasks 8–12. ProjectPicker (useSpringCursor, ProjectRow) → Tasks 13–14. PipelineList (pipelineFormat+test, PipelineRow) → Tasks 15–16. Testing strategy (existing view tests unchanged + pipelineFormat unit test + vite build) → per-task gates + Task 17. Placement conventions honored (features/<domain>/{components,composables,lib}, shared/composables). useSpringCursor in shared per decision. Lean-test depth per decision (only pipelineFormat gets new tests). All spec sections covered.
- **Placeholder scan:** Component/composable bodies are specified by exact source line ranges to move plus full public interfaces and full wiring snippets; pure helpers and all three shared composables have complete code. The "move lines A–B verbatim" instruction is precise, not a placeholder — it names exact code that exists in the repo. No TBD/TODO.
- **Type/name consistency:** Returned names match their template usages across tasks (`openIid`, `drawerDirty`; `dragging/draggingIid/dragOverKey/justDropped/onDragStart/clearDrag/onDrop/isDropTarget/ghostIndex`; `linkCopied/onCopyClick/openInGitLab`; `media/viewerOpen/viewerIndex/openViewer/onBodyMediaClick`; `fresh/replyingTo/replyBody/replyPending/replyError/openReply/cancelReply/submitReply`; `active/cursor/pinTo/springTo/move`). v-model names (`title`, `editingTitle`, `comment`, `labelIds`, `statusId`, `assigneeUsernames`, the toolbar models) are consistent between component definition and view binding.
- **Ordering note:** Within a view, composables are extracted before the components that consume their returned values get wired, and each task leaves the suite green, so any task is independently revertable.
