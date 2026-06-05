# Issue multi-select: bulk actions + combined multi-issue window

## Goal

Add a multi-select mode to the issue list/board so the user can pick several
issues via checkboxes and then:

1. **Bulk-action** the selection — add/remove labels, set assignees, set
   work-item status — with a confirm step and a result summary.
2. **Open the selection in one combined native window** that shows a single
   issue at a time behind a `‹ X of N ›` pager, each page fully editable like a
   single-issue window.

This builds on the native per-issue window feature (`issueWindowUrl`,
`openIssueWindow`, `IssueDetail` `windowed` mode) already in `main`.

## Decisions (from brainstorming)

- Multi-select works in **both** the list and board views, sharing one bulk bar.
- The combined window is **fully editable per page** (reuses `IssueDetail` in
  `windowed` mode); paging away from a dirty page prompts to discard.
- Bulk actions show a **confirm dialog first**, then apply optimistically and
  emit a result toast.
- "Open combined" spawns a **new window each time** (no dedupe).

## Part A — Selection model & bulk actions

### Selection state — `useIssueSelection(fullPath)`

A composable owning ephemeral selection state:

- `mode: Ref<boolean>` — select-mode on/off.
- `selected: Ref<Set<string>>` — selected iids.
- `toggle(iid)`, `selectAll(iids: string[])`, `clear()`, `exit()` (clears the set
  and turns mode off).
- `isSelected(iid): boolean`, `count` computed.

Not persisted. Cleared when the project (`fullPath`) changes and when select-mode
is exited. The Set survives filtering/sort/pagination — a selected issue that is
later filtered out stays in the Set.

`IssueList.vue` constructs one instance and shares it with rows/cards via
`provide`/`inject` (a `Symbol` injection key exported from the composable),
avoiding prop-threading through the `v-for`. Rows/cards `inject` it; if not
provided (e.g. in isolated tests) they fall back to a no-op/disabled state so
they render unchanged.

### Mode toggle

A new toggle button added to the toolbar's existing view-toggle cluster (a
checkbox-style icon). Off = current behavior. On = checkboxes render on every
list row and board card. Toggling mode off calls `exit()`.

### Checkbox component — `ui/checkbox`

Add a shadcn-vue Checkbox (reka-ui `CheckboxRoot`-based) under
`src/components/ui/checkbox/`, matching the existing `ui/` component set
(`Checkbox.vue` + `index.ts`). Used on rows and cards.

### Click behavior in select mode

While `mode` is on:

- `IssueRow`: the drawer-open `RouterLink` overlay is suppressed; a click
  anywhere on the row toggles selection. The checkbox reflects state.
- `IssueCard`: drag is disabled and a click toggles selection.
- Facet buttons (label/assignee/priority filters) remain inert to selection —
  they keep filtering (they already `stop` propagation / sit above the overlay).

`Shift`-click range-select is out of scope for v1.

### Bulk action bar — `BulkActionBar.vue`

A floating, theme-styled bar anchored bottom-center, shared by list and board.
It animates in whenever `count > 0`. Contents:

- `N selected`
- **Labels**, **Assign**, **Status** (each opens the existing picker:
  `LabelPicker`, `AssigneeEditor`/`QuickAssign`, `StatusPicker`)
- **Open combined**
- **Select all (loaded)** — selects the currently-loaded issue iids
- **Clear** — `clear()` (keeps mode on)

`IssueList` passes the loaded iids and the selection composable; the bar emits
intent (`open-combined`, action requests) that `IssueList` (or the bulk
composable) handles. The bar itself holds no mutation logic.

### Bulk mutations — `useBulkIssueActions(fullPath)`

Wraps the existing per-issue mutations and applies them across a list of iids:

- Reuses `useRetagIssue` (`{ iid, addLabelIds, removeLabelIds }`),
  `useReassignIssue` (`{ iid, assigneeUsernames }`), `useSetIssueStatus`
  (`{ iid, statusId, nextStatus }`). These already do optimistic updates on the
  `['issues', fullPath]` query, so a bulk apply is N independent mutations.
- Each bulk action: (1) show a `useConfirm` dialog (e.g. "Set status to 'In
  progress' for 4 issues?"); (2) on confirm, fire all mutations (awaiting via
  `Promise.allSettled`); (3) emit a result toast summarizing
  `succeeded`/`failed` counts (e.g. "4 updated · 1 failed"). On all-success the
  toast is a simple confirmation; failures are surfaced but do not roll back the
  successes.
- Returns typed action methods: `addLabels(iids, labelIds)`,
  `removeLabels(iids, labelIds)`, `setAssignees(iids, usernames, nextAssignees)`,
  `setStatus(iids, statusId, nextStatus)`. Each returns
  `{ succeeded: number; failed: number }`.

Bulk action semantics:

- **Labels** — pick labels to **add** to all selected (`addLabelIds`). The same
  picker offers a "Remove" toggle that switches to removing the chosen labels
  (`removeLabelIds`).
- **Assign** — pick assignee(s); **replaces** the assignee set on all selected.
- **Status** — pick one status; sets it on all selected.

After a successful bulk action the selection is kept (not auto-cleared), so the
user can chain actions; **Clear** is one click away.

## Part B — Combined multi-issue window

### Transport & route

- New host RPC `openIssuesWindow({ fullPath, iids: string[] })` — builds the
  multi-issue URL and spawns a fresh `BrowserWindow` each call (no registry/no
  dedupe), titled `${iids.length} issues · ${repo}`.
- New URL builder `issuesWindowUrl(base, fullPath, iids)` in
  `src/bun/issueWindow.ts`, returning
  `` `${base}#/projects/${fullPath}/issues-window?iids=${iids.join(',')}&window=1` ``.
- New route `name: 'issues-window'`, path
  `/projects/:fullPath(.*)/issues-window`, component `MultiIssueWindow.vue`, with
  a `props` function mapping `fullPath` (param), `iids` (comma-split from query),
  and `windowed` (`query.window === '1'`).

### `MultiIssueWindow.vue`

- Props: `fullPath: string`, `iids: string[]`, `windowed?: boolean`.
- Internal `index: Ref<number>` (0-based), starting at 0. `current` = `iids[index]`.
- Renders a slim header: repo eyebrow + a centered `‹  {{ index + 1 }} of
  {{ iids.length }}  ›` pager (mono, tabular). Prev/Next buttons, disabled at the
  ends (no wraparound). `←`/`→` keys also page (ignored while typing in an
  input/textarea, mirroring IssueList's key-guard).
- Below the header, renders `IssueDetail` with `:full-path`, `:iid="current"`,
  and `windowed` true (so the single-issue back-arrow is suppressed and editing
  works). `IssueDetail` is keyed by `current` so paging remounts it cleanly.
- Sets the document/window title to `${repo} · ${index + 1} of ${iids.length}`.

### Pager dirty guard

`IssueDetail` emits `update:dirty`. `MultiIssueWindow` listens and tracks the
current page's dirty flag. Prev/Next first check the flag; if dirty, run
`useConfirm` ("Discard unsaved changes?") and only page on confirm — the same
guard the drawer/expand path uses. After paging, the dirty flag resets (the
remounted `IssueDetail` re-emits its initial clean state).

### Edge cases

- One iid → renders `1 of 1`, both pager buttons disabled.
- Empty/garbage `iids` query → render a quiet "No issues" state (defensive; the
  app never produces this, the URL is host-built).

## File structure

**Create**
- `src/composables/useIssueSelection.ts` (+ test)
- `src/composables/useBulkIssueActions.ts` (+ test)
- `src/components/BulkActionBar.vue` (+ test)
- `src/components/ui/checkbox/Checkbox.vue`, `src/components/ui/checkbox/index.ts`
- `src/views/MultiIssueWindow.vue` (+ test)

**Modify**
- `src/bun/issueWindow.ts` — add `issuesWindowUrl` (+ test cases in
  `issueWindow.test.ts`)
- `src/bun/index.ts` — add `openIssuesWindow` handler (uses `buildRpc()`, no
  registry)
- `src/lib/rpcContract.ts`, `src/lib/rpc.ts` — add `openIssuesWindow`
- `src/router/index.ts` — add the `issues-window` route
- `src/components/IssueRow.vue` — checkbox + select-mode click (inject selection)
- `src/components/IssueCard.vue` — checkbox + select-mode click; drag disabled in
  select mode
- `src/views/IssueList.vue` — construct + provide selection, add mode toggle,
  render `<BulkActionBar>`, pass loaded iids, gate board drag handlers on
  `!mode`

## Testing

- `issuesWindowUrl` — multi-iid URL off both bases; single iid; preserves order.
- `useIssueSelection` — toggle, selectAll, clear, exit-clears-and-disables-mode,
  fullPath-change clears, isSelected/count.
- `useBulkIssueActions` — applies each action across iids, aggregates
  succeeded/failed via `Promise.allSettled`, no mutation when confirm is
  cancelled, correct add/remove/replace/set semantics.
- `BulkActionBar` — shows count, renders the action buttons, emits the right
  events; hidden when count is 0.
- `MultiIssueWindow` — pager bounds (buttons disabled at ends), `←/→` paging,
  dirty-guard blocks paging when cancelled and allows when confirmed, single-iid
  case, title reflects position.
- `IssueRow` / `IssueCard` — in select mode a click toggles selection and
  navigation/drag is suppressed; out of select mode behavior is unchanged;
  checkbox reflects `isSelected`.
- `IssueList` — toggling mode shows checkboxes and the bar appears when something
  is selected; board drag is disabled in select mode.

## Phasing

One spec, two implementation plans:

- **Plan 1 — Selection + bulk actions** (Part A): `useIssueSelection`,
  `ui/checkbox`, row/card checkboxes + select-mode click, mode toggle,
  `BulkActionBar`, `useBulkIssueActions`, IssueList wiring. Independently
  shippable.
- **Plan 2 — Combined window** (Part B): `issuesWindowUrl`, `openIssuesWindow`
  RPC + bridge, `issues-window` route, `MultiIssueWindow`, and wiring the bar's
  "Open combined" to the RPC. Builds on Plan 1's selection.

## Out of scope

- `Shift`-click range selection.
- Board-column-aware bulk moves beyond the three field actions.
- Combined-window dedupe / reuse.
- Native-OS-close unsaved-edit guarding (a known limitation of native windows,
  consistent with the existing single-issue window).
