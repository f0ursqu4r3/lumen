# Codebase Reorganization — Feature-Sliced Structure

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan

## Problem

`src/` has coherent top-level layers (`components/`, `composables/`, `lib/`, `views/`,
`gitlab/`, `bun/`) but they have grown into flat, mixed-domain sprawl:

- `components/` — 27 components spanning issue, pipeline, label, assignee, and generic
  UI concerns, all in one flat directory.
- `composables/` — 24 composables across issues, pipelines, projects, and cross-cutting
  concerns, flat.
- `lib/` — mixes generic utilities (`utils`, `persist`, `markdown`) with domain logic
  (`labels`, `assigneeOrder`, `issueView`).
- Orphans and dead space: `pipelineTone.ts` sits in `components/`; `components/ui/` is an
  empty shadcn placeholder.

Result (per user): can't find things, unclear boundaries, no convention for where new
code goes. All four pain points confirmed.

## Decision

Adopt a **feature-sliced** structure (domain is the top split), executed as a **big-bang**
reorg in a single branch. Each feature colocates its own `components/`, `composables/`,
and `lib/`. Cross-cutting code moves to `shared/`. Route-level and platform layers stay
where they are.

### Target structure

```
src/
  features/
    issues/      { components/, composables/, lib/ }
    pipelines/   { components/, composables/, lib/ }
    projects/    { composables/, lib/ }
    labels/      { components/, composables/, lib/ }
    assignees/   { components/, lib/ }
  shared/
    ui/          (shadcn-vue vendored primitives — was components/ui/)
    components/  (our generic, domain-agnostic components)
    composables/ (cross-cutting composables)
    lib/         (generic utilities, incl. utils.ts / cn helper)
  gitlab/        (API client layer — unchanged)
  bun/           (Electrobun main-process — unchanged)
  router/        (unchanged)
  mainview/      (unchanged)
  test/          (unchanged)
  App.vue  main.ts  styles.css  env.d.ts  App.test.ts
```

### Stays put

`views/`, `gitlab/`, `bun/`, `router/`, `mainview/`, `test/`, and the `src/` root files
are already coherent and remain at the top level. Route components (`IssueList`,
`IssueDetail`, `PipelineList`, `ProjectPicker`, `ConnectView`, `MultiIssueWindow`) stay in
`views/` — the view layer is distinct from feature internals.

Colocated `*.test.ts` files move together with their source file.

## File map

### features/issues
- **components/** IssueCard, IssueRow, IssueComposer, IssueDrawer, IssueFilterPanel,
  BulkActionBar, StateBadge, StatusPicker
- **composables/** useIssue, useIssues, useIssueDraft, useIssueFilters, useIssueMedia,
  useIssueMutations, useIssueSelection, useBulkIssueActions, useWorkItemStatus
- **lib/** issueView, issueEdit

### features/pipelines
- **components/** PipelineStages, PipelineStageDots, PipelineStatusBadge
- **composables/** usePipelines, usePipelineNotifications, usePipelineWatch
- **lib/** pipelineTone  (moved out of `components/`)

### features/projects
- **composables/** useProjects, useProjectBrowser, useProjectContributors,
  useProjectMembers, useAssignedProjects, useStarredProjects, useToggleStar
- **lib/** assignedProjects

### features/labels
- **components/** LabelChip, LabelPicker, LabelGroupMenu
- **composables/** useProjectLabels
- **lib/** labels, labelGroups

### features/assignees
- **components/** AssigneeAvatar, AssigneeEditor, AssigneeMenu, AssigneePicker, QuickAssign
- **lib/** assigneeOrder

### shared/ui  (shadcn-vue primitives — relocated from `components/ui/`)
alert, alert-dialog, avatar, badge, button, card, checkbox, dialog, input, label, select,
sheet, skeleton, stepper, textarea (each is its own subdirectory with an `index.ts` barrel).

### shared/components  (our generic app components)
ConfirmDialog, ErrorNotice, Odometer, ToastHost, MediaViewer, MarkdownText, EditableField,
Scratchpad, SettingsDialog, SavedViews

### shared/composables
useToast, useConfirm, useSettings, useScratchpad, useSavedViews, useGitlabAsset,
useGitlabConnect, useGitlabUrl

### shared/lib
utils, persist, markdown, media, appActive, viewTransition, rpc, rpcContract
(`utils.ts` is the shadcn `cn` helper — it moves with the rest of lib.)

## shadcn-vue tooling

`components.json` wires the shadcn CLI to alias paths. Those aliases MUST be updated to the
new locations or future `shadcn-vue add` commands write to the wrong place and added
components fail to resolve `cn`. The CLI reads `aliases` from `components.json` (confirmed
via the shadcn-vue skill); updating them is the supported relocation mechanism.

| alias | before | after |
|---|---|---|
| `ui` | `@/components/ui` | `@/shared/ui` |
| `components` | `@/components` | `@/shared/components` |
| `composables` | `@/composables` | `@/shared/composables` |
| `utils` | `@/lib/utils` | `@/shared/lib/utils` |
| `lib` | `@/lib` | `@/shared/lib` |

Internal references inside the vendored primitives also get rewritten by the same global
import pass: `@/lib/utils` → `@/shared/lib/utils`, and the few `@/components/ui/*` sibling
imports (e.g. in `alert-dialog/`) → `@/shared/ui/*`.

## Resolved judgment calls

- **SavedViews** (component + `useSavedViews`) → **shared**. Used by both IssueList and
  `usePipelineWatch`; it is a cross-feature saved-filter mechanism, not issue-specific.
- **useProjectLabels** → **features/labels**. Keeps all label logic in one place even
  though the data is project-scoped.
- **God-file splits** (IssueList 1072 lines, IssueDetail 715) → **out of scope** for this
  pass. Reorg first; split in a follow-up branch to keep this diff a pure move.

## Implementation approach

1. Create the new directory tree.
2. `git mv` each file (and its colocated test) to its destination — preserves history.
3. Scripted rewrite of import paths across all `*.ts` / `*.vue`:
   - Imports are `@/`-aliased (≈318 occurrences) plus ≈166 relative. The alias rewrite is
     a deterministic old-path → new-path mapping built from the file map.
   - Relative imports between moved files must be re-pointed; simplest is to convert any
     now-broken relative import to its `@/`-aliased equivalent.
4. Update `components.json` aliases (see shadcn-vue table).
5. Verify (see below).

## Verification

- TypeScript typecheck is **expected red** until `bun codegen` runs against the live
  GitLab instance (`src/gitlab/generated` is gitignored). Typecheck is therefore not the
  gate for this change.
- **Gate = `bun test`** (vitest). Vitest resolves the `@/` alias, and tests are colocated
  with every non-trivial module, so a green test run proves every moved import resolves.
- Secondary check: `bun run build` (vite) completes without unresolved-import errors.
- Manual smoke: launch the app, confirm issue list, issue detail, pipelines, and project
  picker render.

## Non-goals

- Splitting large files (separate follow-up).
- Changing any runtime behavior, component API, or composable signature — this is a pure
  move + import rewrite.
- Introducing per-feature barrel (`index.ts`) files. Imports stay direct
  (`@/features/issues/components/IssueCard.vue`) to avoid added indirection.
- Touching `gitlab/`, `bun/`, `router/` internals.
