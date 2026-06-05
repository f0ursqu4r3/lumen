# Codebase Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `src/` from flat layer directories into a feature-sliced layout (`features/<domain>/{components,composables,lib}` + `shared/{ui,components,composables,lib}`), as a pure move + import-rewrite with no behavior change.

**Architecture:** Files move via `git mv` (history preserved). All inter-module imports use the `@/` alias, so rewriting is a deterministic, boundary-anchored string replacement driven by a small codemod script (`scripts/reorg-remap.mjs`). The work is done one group at a time; after each group the full test suite must stay green before committing. shadcn-vue primitives relocate too, and `components.json` aliases are updated so the shadcn CLI keeps resolving.

**Tech Stack:** Vue 3 + TypeScript, Vite, Vitest, Electrobun, shadcn-vue, bun.

---

## Why tests are the gate (read first)

- TypeScript typecheck is **expected to be red** independent of this work: `src/gitlab/generated` is gitignored and only produced by `bun codegen` against the live GitLab instance. Do **not** use `tsc`/typecheck as a pass/fail signal here.
- The gate is **`bunx vitest run`** (one-shot Vitest). NOTE: the package script `"test": "vitest"` runs in **watch mode** and never exits, and `bun test` runs Bun's *built-in* runner (no `vi`, no jsdom) which spuriously fails ~227 tests — do NOT use either. Always use `bunx vitest run`. Vitest resolves the `@/` alias via `vitest.config.ts`, and nearly every module has a colocated `*.test.ts`. Baseline before the reorg: **76 files, 467 tests, all passing.**
- Secondary gate (final task only): **`bunx vite build`** must complete without unresolved-import errors — this catches shadcn/runtime import breakage tests might miss. Do NOT use `bun run build`: it runs `vue-tsc` first, which is expected-red because `src/gitlab/generated` requires `bun codegen` against the live instance.

## Conventions used in every move task

- Tests are colocated (`Foo.test.ts` next to `Foo.vue`) and **move together with their source** in the same `git mv`. Their `./Foo` relative imports stay valid because source and test land in the same directory.
- Relative imports that cross a *new* directory boundary are normalized to `@/` form in Task 1 first, so the codemod catches them. (Only 3 files / 5 import lines need this — verified.)
- The codemod (`scripts/reorg-remap.mjs`) matches an alias path **only at a module-specifier boundary** (next character is `'`, `"`, `.`, or `/`), so `@/composables/useIssue` never corrupts `@/composables/useIssues`.

## File Structure (end state)

```
src/
  features/
    issues/      components/ composables/ lib/
    pipelines/   components/ composables/ lib/
    projects/    composables/ lib/
    labels/      components/ composables/ lib/
    assignees/   components/ lib/
  shared/
    ui/          (shadcn primitives, was components/ui/)
    components/  (generic app components)
    composables/
    lib/
  gitlab/  bun/  router/  mainview/  test/   (unchanged)
  views/  App.vue  main.ts  styles.css  env.d.ts  App.test.ts
scripts/
  reorg-remap.mjs   (new helper; may be deleted after reorg)
```

---

## Task 1: Scaffold dirs, codemod helper, normalize breaking relatives

**Files:**
- Create: `scripts/reorg-remap.mjs`
- Create: empty target directories (via `.gitkeep`, removed as files land)
- Modify: `src/components/IssueComposer.vue`, `src/components/IssueRow.vue`, `src/lib/issueView.ts`

- [ ] **Step 1: Write the codemod helper**

Create `scripts/reorg-remap.mjs`:

```js
// Boundary-anchored import-path remapper for the feature-sliced reorg.
// Usage: bun scripts/reorg-remap.mjs "@/old/path=@/new/path" ["@/a=@/b" ...]
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const pairs = process.argv.slice(2).map((arg) => {
  const eq = arg.indexOf('=')
  if (eq < 0) throw new Error(`bad pair (need from=to): ${arg}`)
  return { from: arg.slice(0, eq), to: arg.slice(eq + 1) }
})
// Apply longest 'from' first so specific paths win over shorter prefixes.
pairs.sort((a, b) => b.from.length - a.from.length)

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      if (entry !== 'generated' && entry !== 'node_modules') walk(p)
    } else if (/\.(ts|vue)$/.test(entry)) {
      files.push(p)
    }
  }
})('src')

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
let changed = 0
for (const file of files) {
  const before = readFileSync(file, 'utf8')
  let after = before
  for (const { from, to } of pairs) {
    // Only match when the next char ends the module path: quote, dot (extension), or slash (subpath).
    after = after.replace(new RegExp(esc(from) + `(?=['"./])`, 'g'), to)
  }
  if (after !== before) {
    writeFileSync(file, after)
    changed++
  }
}
console.log(`reorg-remap: rewrote ${changed} file(s) from ${pairs.length} pair(s)`)
```

- [ ] **Step 2: Create the target directory tree**

Run:

```bash
cd /Users/la.kyle.dougan/git/personal/lumen
mkdir -p src/features/issues/{components,composables,lib} \
         src/features/pipelines/{components,composables,lib} \
         src/features/projects/{composables,lib} \
         src/features/labels/{components,composables,lib} \
         src/features/assignees/{components,lib} \
         src/shared/{ui,components,composables,lib}
# git won't track empty dirs; placeholders keep them until files land.
find src/features src/shared -type d -empty -exec touch {}/.gitkeep \;
```

- [ ] **Step 3: Normalize the 5 cross-boundary relative imports to `@/` form**

These relative imports point at files that will move to a *different* directory than their importer. Convert them to alias form so the codemod can rewrite them later. Make these exact edits:

In `src/components/IssueComposer.vue`:
```
import ErrorNotice from './ErrorNotice.vue'      ->  import ErrorNotice from '@/components/ErrorNotice.vue'
import LabelPicker from './LabelPicker.vue'      ->  import LabelPicker from '@/components/LabelPicker.vue'
import AssigneePicker from './AssigneePicker.vue' ->  import AssigneePicker from '@/components/AssigneePicker.vue'
```

In `src/components/IssueRow.vue`:
```
import LabelChip from './LabelChip.vue'  ->  import LabelChip from '@/components/LabelChip.vue'
```
(Leave `import StateBadge from './StateBadge.vue'` — StateBadge stays in the same issues/components dir.)

In `src/lib/issueView.ts`:
```
import { priorityOf, parseLabel } from './labels'  ->  import { priorityOf, parseLabel } from '@/lib/labels'
```

- [ ] **Step 4: Run tests to confirm normalization is behavior-neutral**

Run: `bunx vitest run`
Expected: PASS (467 tests) (same count as before; relative→alias is a no-op at runtime).

- [ ] **Step 5: Commit**

```bash
git add scripts/reorg-remap.mjs src/features src/shared src/components/IssueComposer.vue src/components/IssueRow.vue src/lib/issueView.ts
git commit -m "chore(reorg): scaffold feature dirs, add remap codemod, normalize relatives"
```

---

## Task 2: Move shadcn primitives → shared/ui

**Files:**
- Move: `src/components/ui/` → `src/shared/ui/`

- [ ] **Step 1: Move the directory**

```bash
rm -f src/shared/ui/.gitkeep
git mv src/components/ui src/shared/ui
```

- [ ] **Step 2: Rewrite all references**

```bash
bun scripts/reorg-remap.mjs "@/components/ui=@/shared/ui"
```
This rewrites every consumer (`@/components/ui/button` → `@/shared/ui/button`) and the primitives' own sibling imports (e.g. `alert-dialog/` internals). Their `@/lib/utils` (`cn`) imports remain valid until Task 5.

- [ ] **Step 3: Run tests**

Run: `bunx vitest run`
Expected: PASS (467 tests).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(reorg): relocate shadcn primitives to shared/ui"
```

---

## Task 3: Move generic app components → shared/components

**Files:**
- Move (each with its `.test.ts` if present): ConfirmDialog, ErrorNotice, Odometer, ToastHost, MediaViewer, MarkdownText, EditableField, Scratchpad, SettingsDialog, SavedViews — from `src/components/` → `src/shared/components/`

- [ ] **Step 1: Move the files (and colocated tests)**

```bash
cd /Users/la.kyle.dougan/git/personal/lumen
rm -f src/shared/components/.gitkeep
for n in ConfirmDialog ErrorNotice Odometer ToastHost MediaViewer MarkdownText EditableField Scratchpad SettingsDialog SavedViews; do
  git mv "src/components/$n.vue" "src/shared/components/$n.vue"
  [ -f "src/components/$n.test.ts" ] && git mv "src/components/$n.test.ts" "src/shared/components/$n.test.ts"
done
```

- [ ] **Step 2: Rewrite all references**

```bash
bun scripts/reorg-remap.mjs \
  "@/components/ConfirmDialog=@/shared/components/ConfirmDialog" \
  "@/components/ErrorNotice=@/shared/components/ErrorNotice" \
  "@/components/Odometer=@/shared/components/Odometer" \
  "@/components/ToastHost=@/shared/components/ToastHost" \
  "@/components/MediaViewer=@/shared/components/MediaViewer" \
  "@/components/MarkdownText=@/shared/components/MarkdownText" \
  "@/components/EditableField=@/shared/components/EditableField" \
  "@/components/Scratchpad=@/shared/components/Scratchpad" \
  "@/components/SettingsDialog=@/shared/components/SettingsDialog" \
  "@/components/SavedViews=@/shared/components/SavedViews"
```

- [ ] **Step 3: Run tests**

Run: `bunx vitest run`
Expected: PASS (467 tests).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(reorg): move generic components to shared/components"
```

---

## Task 4: Move cross-cutting composables → shared/composables

**Files:**
- Move (with colocated tests): useToast, useConfirm, useSettings, useScratchpad, useSavedViews, useGitlabAsset, useGitlabConnect, useGitlabUrl — `src/composables/` → `src/shared/composables/`

- [ ] **Step 1: Move the files (and colocated tests)**

```bash
cd /Users/la.kyle.dougan/git/personal/lumen
rm -f src/shared/composables/.gitkeep
for n in useToast useConfirm useSettings useScratchpad useSavedViews useGitlabAsset useGitlabConnect useGitlabUrl; do
  git mv "src/composables/$n.ts" "src/shared/composables/$n.ts"
  [ -f "src/composables/$n.test.ts" ] && git mv "src/composables/$n.test.ts" "src/shared/composables/$n.test.ts"
done
```

- [ ] **Step 2: Rewrite all references**

```bash
bun scripts/reorg-remap.mjs \
  "@/composables/useToast=@/shared/composables/useToast" \
  "@/composables/useConfirm=@/shared/composables/useConfirm" \
  "@/composables/useSettings=@/shared/composables/useSettings" \
  "@/composables/useScratchpad=@/shared/composables/useScratchpad" \
  "@/composables/useSavedViews=@/shared/composables/useSavedViews" \
  "@/composables/useGitlabAsset=@/shared/composables/useGitlabAsset" \
  "@/composables/useGitlabConnect=@/shared/composables/useGitlabConnect" \
  "@/composables/useGitlabUrl=@/shared/composables/useGitlabUrl"
```

- [ ] **Step 3: Run tests**

Run: `bunx vitest run`
Expected: PASS (467 tests).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(reorg): move cross-cutting composables to shared/composables"
```

---

## Task 5: Move generic utilities → shared/lib

**Files:**
- Move (with colocated tests): utils, persist, markdown, media, appActive, viewTransition, rpc, rpcContract — `src/lib/` → `src/shared/lib/`

- [ ] **Step 1: Move the files (and colocated tests)**

```bash
cd /Users/la.kyle.dougan/git/personal/lumen
rm -f src/shared/lib/.gitkeep
for n in utils persist markdown media appActive viewTransition rpc rpcContract; do
  git mv "src/lib/$n.ts" "src/shared/lib/$n.ts"
  [ -f "src/lib/$n.test.ts" ] && git mv "src/lib/$n.test.ts" "src/shared/lib/$n.test.ts"
done
```

- [ ] **Step 2: Rewrite all references**

```bash
bun scripts/reorg-remap.mjs \
  "@/lib/utils=@/shared/lib/utils" \
  "@/lib/persist=@/shared/lib/persist" \
  "@/lib/markdown=@/shared/lib/markdown" \
  "@/lib/media=@/shared/lib/media" \
  "@/lib/appActive=@/shared/lib/appActive" \
  "@/lib/viewTransition=@/shared/lib/viewTransition" \
  "@/lib/rpc=@/shared/lib/rpc" \
  "@/lib/rpcContract=@/shared/lib/rpcContract"
```
This also fixes the `cn` (`@/lib/utils`) imports inside the relocated shadcn primitives.

- [ ] **Step 3: Run tests**

Run: `bunx vitest run`
Expected: PASS (467 tests).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(reorg): move generic utilities to shared/lib"
```

---

## Task 6: Move the issues feature

**Files:**
- components → `src/features/issues/components/`: IssueCard, IssueRow, IssueComposer, IssueDrawer, IssueFilterPanel, BulkActionBar, StateBadge, StatusPicker
- composables → `src/features/issues/composables/`: useIssue, useIssues, useIssueDraft, useIssueFilters, useIssueMedia, useIssueMutations, useIssueSelection, useBulkIssueActions, useWorkItemStatus
- lib → `src/features/issues/lib/`: issueView, issueEdit

- [ ] **Step 1: Move the files (and colocated tests)**

```bash
cd /Users/la.kyle.dougan/git/personal/lumen
rm -f src/features/issues/components/.gitkeep src/features/issues/composables/.gitkeep src/features/issues/lib/.gitkeep
for n in IssueCard IssueRow IssueComposer IssueDrawer IssueFilterPanel BulkActionBar StateBadge StatusPicker; do
  git mv "src/components/$n.vue" "src/features/issues/components/$n.vue"
  [ -f "src/components/$n.test.ts" ] && git mv "src/components/$n.test.ts" "src/features/issues/components/$n.test.ts"
done
for n in useIssue useIssues useIssueDraft useIssueFilters useIssueMedia useIssueMutations useIssueSelection useBulkIssueActions useWorkItemStatus; do
  git mv "src/composables/$n.ts" "src/features/issues/composables/$n.ts"
  [ -f "src/composables/$n.test.ts" ] && git mv "src/composables/$n.test.ts" "src/features/issues/composables/$n.test.ts"
done
for n in issueView issueEdit; do
  git mv "src/lib/$n.ts" "src/features/issues/lib/$n.ts"
  [ -f "src/lib/$n.test.ts" ] && git mv "src/lib/$n.test.ts" "src/features/issues/lib/$n.test.ts"
done
```

- [ ] **Step 2: Rewrite all references**

```bash
bun scripts/reorg-remap.mjs \
  "@/components/IssueCard=@/features/issues/components/IssueCard" \
  "@/components/IssueRow=@/features/issues/components/IssueRow" \
  "@/components/IssueComposer=@/features/issues/components/IssueComposer" \
  "@/components/IssueDrawer=@/features/issues/components/IssueDrawer" \
  "@/components/IssueFilterPanel=@/features/issues/components/IssueFilterPanel" \
  "@/components/BulkActionBar=@/features/issues/components/BulkActionBar" \
  "@/components/StateBadge=@/features/issues/components/StateBadge" \
  "@/components/StatusPicker=@/features/issues/components/StatusPicker" \
  "@/composables/useIssue=@/features/issues/composables/useIssue" \
  "@/composables/useIssues=@/features/issues/composables/useIssues" \
  "@/composables/useIssueDraft=@/features/issues/composables/useIssueDraft" \
  "@/composables/useIssueFilters=@/features/issues/composables/useIssueFilters" \
  "@/composables/useIssueMedia=@/features/issues/composables/useIssueMedia" \
  "@/composables/useIssueMutations=@/features/issues/composables/useIssueMutations" \
  "@/composables/useIssueSelection=@/features/issues/composables/useIssueSelection" \
  "@/composables/useBulkIssueActions=@/features/issues/composables/useBulkIssueActions" \
  "@/composables/useWorkItemStatus=@/features/issues/composables/useWorkItemStatus" \
  "@/lib/issueView=@/features/issues/lib/issueView" \
  "@/lib/issueEdit=@/features/issues/lib/issueEdit"
```
(The boundary anchor makes `@/composables/useIssue` skip `@/composables/useIssues`, etc.)

- [ ] **Step 3: Run tests**

Run: `bunx vitest run`
Expected: PASS (467 tests).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(reorg): move issues feature into features/issues"
```

---

## Task 7: Move the pipelines feature

**Files:**
- components → `src/features/pipelines/components/`: PipelineStages, PipelineStageDots, PipelineStatusBadge
- composables → `src/features/pipelines/composables/`: usePipelines, usePipelineNotifications, usePipelineWatch
- lib → `src/features/pipelines/lib/`: pipelineTone (currently `src/components/pipelineTone.ts`)

- [ ] **Step 1: Move the files (and colocated tests)**

```bash
cd /Users/la.kyle.dougan/git/personal/lumen
rm -f src/features/pipelines/components/.gitkeep src/features/pipelines/composables/.gitkeep src/features/pipelines/lib/.gitkeep
for n in PipelineStages PipelineStageDots PipelineStatusBadge; do
  git mv "src/components/$n.vue" "src/features/pipelines/components/$n.vue"
  [ -f "src/components/$n.test.ts" ] && git mv "src/components/$n.test.ts" "src/features/pipelines/components/$n.test.ts"
done
for n in usePipelines usePipelineNotifications usePipelineWatch; do
  git mv "src/composables/$n.ts" "src/features/pipelines/composables/$n.ts"
  [ -f "src/composables/$n.test.ts" ] && git mv "src/composables/$n.test.ts" "src/features/pipelines/composables/$n.test.ts"
done
git mv "src/components/pipelineTone.ts" "src/features/pipelines/lib/pipelineTone.ts"
```

- [ ] **Step 2: Rewrite all references**

```bash
bun scripts/reorg-remap.mjs \
  "@/components/PipelineStages=@/features/pipelines/components/PipelineStages" \
  "@/components/PipelineStageDots=@/features/pipelines/components/PipelineStageDots" \
  "@/components/PipelineStatusBadge=@/features/pipelines/components/PipelineStatusBadge" \
  "@/components/pipelineTone=@/features/pipelines/lib/pipelineTone" \
  "@/composables/usePipelines=@/features/pipelines/composables/usePipelines" \
  "@/composables/usePipelineNotifications=@/features/pipelines/composables/usePipelineNotifications" \
  "@/composables/usePipelineWatch=@/features/pipelines/composables/usePipelineWatch"
```
(`@/components/PipelineStages` skips `@/components/PipelineStageDots` via the boundary anchor; `@/composables/usePipelines` skips `usePipelineNotifications`/`usePipelineWatch`.)

- [ ] **Step 3: Run tests**

Run: `bunx vitest run`
Expected: PASS (467 tests).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(reorg): move pipelines feature into features/pipelines"
```

---

## Task 8: Move the projects feature

**Files:**
- composables → `src/features/projects/composables/`: useProjects, useProjectBrowser, useProjectContributors, useProjectMembers, useAssignedProjects, useStarredProjects, useToggleStar
- lib → `src/features/projects/lib/`: assignedProjects

- [ ] **Step 1: Move the files (and colocated tests)**

```bash
cd /Users/la.kyle.dougan/git/personal/lumen
rm -f src/features/projects/composables/.gitkeep src/features/projects/lib/.gitkeep
for n in useProjects useProjectBrowser useProjectContributors useProjectMembers useAssignedProjects useStarredProjects useToggleStar; do
  git mv "src/composables/$n.ts" "src/features/projects/composables/$n.ts"
  [ -f "src/composables/$n.test.ts" ] && git mv "src/composables/$n.test.ts" "src/features/projects/composables/$n.test.ts"
done
git mv "src/lib/assignedProjects.ts" "src/features/projects/lib/assignedProjects.ts"
[ -f "src/lib/assignedProjects.test.ts" ] && git mv "src/lib/assignedProjects.test.ts" "src/features/projects/lib/assignedProjects.test.ts"
```

- [ ] **Step 2: Rewrite all references**

```bash
bun scripts/reorg-remap.mjs \
  "@/composables/useProjects=@/features/projects/composables/useProjects" \
  "@/composables/useProjectBrowser=@/features/projects/composables/useProjectBrowser" \
  "@/composables/useProjectContributors=@/features/projects/composables/useProjectContributors" \
  "@/composables/useProjectMembers=@/features/projects/composables/useProjectMembers" \
  "@/composables/useAssignedProjects=@/features/projects/composables/useAssignedProjects" \
  "@/composables/useStarredProjects=@/features/projects/composables/useStarredProjects" \
  "@/composables/useToggleStar=@/features/projects/composables/useToggleStar" \
  "@/lib/assignedProjects=@/features/projects/lib/assignedProjects"
```
(`@/composables/useProjects` skips `useProjectBrowser`/`useProjectMembers`/etc.; `useProjectLabels` is **not** in this set — it belongs to the labels feature, Task 9.)

- [ ] **Step 3: Run tests**

Run: `bunx vitest run`
Expected: PASS (467 tests).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(reorg): move projects feature into features/projects"
```

---

## Task 9: Move the labels feature

**Files:**
- components → `src/features/labels/components/`: LabelChip, LabelPicker, LabelGroupMenu
- composables → `src/features/labels/composables/`: useProjectLabels
- lib → `src/features/labels/lib/`: labels, labelGroups

- [ ] **Step 1: Move the files (and colocated tests)**

```bash
cd /Users/la.kyle.dougan/git/personal/lumen
rm -f src/features/labels/components/.gitkeep src/features/labels/composables/.gitkeep src/features/labels/lib/.gitkeep
for n in LabelChip LabelPicker LabelGroupMenu; do
  git mv "src/components/$n.vue" "src/features/labels/components/$n.vue"
  [ -f "src/components/$n.test.ts" ] && git mv "src/components/$n.test.ts" "src/features/labels/components/$n.test.ts"
done
git mv "src/composables/useProjectLabels.ts" "src/features/labels/composables/useProjectLabels.ts"
[ -f "src/composables/useProjectLabels.test.ts" ] && git mv "src/composables/useProjectLabels.test.ts" "src/features/labels/composables/useProjectLabels.test.ts"
for n in labels labelGroups; do
  git mv "src/lib/$n.ts" "src/features/labels/lib/$n.ts"
  [ -f "src/lib/$n.test.ts" ] && git mv "src/lib/$n.test.ts" "src/features/labels/lib/$n.test.ts"
done
```

- [ ] **Step 2: Rewrite all references**

```bash
bun scripts/reorg-remap.mjs \
  "@/components/LabelChip=@/features/labels/components/LabelChip" \
  "@/components/LabelPicker=@/features/labels/components/LabelPicker" \
  "@/components/LabelGroupMenu=@/features/labels/components/LabelGroupMenu" \
  "@/composables/useProjectLabels=@/features/labels/composables/useProjectLabels" \
  "@/lib/labels=@/features/labels/lib/labels" \
  "@/lib/labelGroups=@/features/labels/lib/labelGroups"
```
(`@/lib/labels` skips `@/lib/labelGroups` — the substring `@/lib/labels` does not occur in `@/lib/labelGroups`.)

- [ ] **Step 3: Run tests**

Run: `bunx vitest run`
Expected: PASS (467 tests).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(reorg): move labels feature into features/labels"
```

---

## Task 10: Move the assignees feature

**Files:**
- components → `src/features/assignees/components/`: AssigneeAvatar, AssigneeEditor, AssigneeMenu, AssigneePicker, QuickAssign
- lib → `src/features/assignees/lib/`: assigneeOrder

- [ ] **Step 1: Move the files (and colocated tests)**

```bash
cd /Users/la.kyle.dougan/git/personal/lumen
rm -f src/features/assignees/components/.gitkeep src/features/assignees/lib/.gitkeep
for n in AssigneeAvatar AssigneeEditor AssigneeMenu AssigneePicker QuickAssign; do
  git mv "src/components/$n.vue" "src/features/assignees/components/$n.vue"
  [ -f "src/components/$n.test.ts" ] && git mv "src/components/$n.test.ts" "src/features/assignees/components/$n.test.ts"
done
git mv "src/lib/assigneeOrder.ts" "src/features/assignees/lib/assigneeOrder.ts"
[ -f "src/lib/assigneeOrder.test.ts" ] && git mv "src/lib/assigneeOrder.test.ts" "src/features/assignees/lib/assigneeOrder.test.ts"
```

- [ ] **Step 2: Rewrite all references**

```bash
bun scripts/reorg-remap.mjs \
  "@/components/AssigneeAvatar=@/features/assignees/components/AssigneeAvatar" \
  "@/components/AssigneeEditor=@/features/assignees/components/AssigneeEditor" \
  "@/components/AssigneeMenu=@/features/assignees/components/AssigneeMenu" \
  "@/components/AssigneePicker=@/features/assignees/components/AssigneePicker" \
  "@/components/QuickAssign=@/features/assignees/components/QuickAssign" \
  "@/lib/assigneeOrder=@/features/assignees/lib/assigneeOrder"
```

- [ ] **Step 3: Run tests**

Run: `bunx vitest run`
Expected: PASS (467 tests).

- [ ] **Step 4: Verify the old layer dirs are empty and remove them**

Run:
```bash
ls src/components src/composables src/lib
```
Expected: each is empty (no files). If empty, remove:
```bash
rmdir src/components src/composables src/lib
```
If any file remains, STOP — it was missed by the plan; classify and move it before continuing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(reorg): move assignees feature; remove emptied layer dirs"
```

---

## Task 11: Update shadcn config, final verification, cleanup

**Files:**
- Modify: `components.json`
- Delete: `scripts/reorg-remap.mjs`

- [ ] **Step 1: Update `components.json` aliases**

Replace the `aliases` block so the shadcn CLI resolves to the new locations:

```json
    "aliases": {
        "components": "@/shared/components",
        "composables": "@/shared/composables",
        "utils": "@/shared/lib/utils",
        "ui": "@/shared/ui",
        "lib": "@/shared/lib"
    },
```

- [ ] **Step 2: Confirm no stale import paths remain**

Run:
```bash
grep -rnE "@/(components|composables|lib)/" src --include='*.ts' --include='*.vue' | grep -vE "@/(shared|features)/"
```
Expected: **no output**. Any hit is an import that still points at an old location — fix it (map it to its new path) before proceeding.

- [ ] **Step 3: Run the full test suite**

Run: `bunx vitest run`
Expected: PASS (467 tests), with the same number of test files/cases as before the reorg.

- [ ] **Step 4: Run the production build**

Run: `bunx vite build`
Expected: completes with no unresolved-import / module-not-found errors. (This is the gate that catches runtime/shadcn import breakage beyond what tests cover. Use `vite build` directly, NOT `bun run build`, which additionally runs `vue-tsc` — expected-red until `bun codegen`.)

- [ ] **Step 5: Manual smoke test**

Launch the app (e.g. `bun run dev`, or the project's Electrobun launch command) and confirm these render without console import errors:
- Project picker
- Issue list
- Issue detail (labels, assignees, status, markdown, media)
- Pipelines view

- [ ] **Step 6: Remove the one-shot codemod helper**

```bash
git rm scripts/reorg-remap.mjs
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(reorg): point shadcn aliases at new paths; remove codemod helper"
```

---

## Self-Review

- **Spec coverage:** All five features (issues, pipelines, projects, labels, assignees) → Tasks 6–10. shared/ui, shared/components, shared/composables, shared/lib → Tasks 2–5. shadcn `components.json` alias updates → Task 11 Step 1 (matches spec table). Relocation-vs-delete of `components/ui` → Task 2 (corrected: relocate, not delete). SavedViews → shared (Task 3). useProjectLabels → labels (Task 9). God-file splits → explicitly out of scope (not a task). Verification via `bunx vitest run` + `bunx vite build` → Task 11.
- **Placeholder scan:** No TBD/TODO; every code/command step shows exact content.
- **Type/path consistency:** Codemod `from` paths match the actual current `@/` import paths; `to` paths match the directories created in Task 1 and the `git mv` destinations in each task. Boundary-anchor reasoning documented where prefix collisions are possible (useIssue/useIssues, PipelineStages/PipelineStageDots, useProjects/useProject*, labels/labelGroups).
- **Ordering:** shared groups (2–5) before features (6–10) is convenient but not required — each task fully repoints references to the files it moves, so the suite is green after every task. Task 5 (shared/lib) fixes the `cn` imports inside the Task 2 primitives; both are committed before the final build in Task 11.
