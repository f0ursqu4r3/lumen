# Details Rail Progressive Disclosure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the issue Details Rail show only populated (and pinned) fields; empty fields hide behind an "Add field" menu and are revealed on demand.

**Architecture:** A pure field-descriptor registry (`railFields.ts`) is the single source of truth for each field's label, pinned-ness, populated-ness, ordering, and clear action. A composable (`useRailFields`) owns transient `revealed`/`removed` sets and derives `visibleKeys` + `hiddenFields`. The registry/composable live in the **parent** (`IssueDetail.vue`, which owns the draft), keeping the rail child mutation-free: it receives `visibleKeys`/`hiddenFields` props and emits `add`/`remove`. No GraphQL changes — the mechanism is pure presentation over the existing draft.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tailwind, `@vueuse/core` (`onClickOutside`), Vitest + `@vue/test-utils`, Bun. Run tests with `bunx vitest run`. Format with `bun run format`.

**Scope:** This plan covers the mechanism + the existing fields (Status, Labels, Assignees pinned; Milestone, Due date, Weight, Estimate, Confidential addable). The EE value fields (Health status, Locked, Iteration, Parent) are a separate follow-on plan — they need live-schema confirmation before their GraphQL can be written concretely.

---

## File structure

- **Create** `src/features/issues/lib/railFields.ts` — descriptor registry + pure visibility helpers.
- **Create** `src/features/issues/lib/railFields.test.ts` — unit tests for the above.
- **Create** `src/features/issues/composables/useRailFields.ts` — composable wrapping the pure helpers with `revealed`/`removed` state.
- **Create** `src/features/issues/composables/useRailFields.test.ts` — composable tests.
- **Create** `src/features/issues/components/RailField.vue` — label + hover-× wrapper for addable value fields.
- **Create** `src/features/issues/components/AddFieldMenu.vue` — "+ Add field" trigger + popover.
- **Create** `src/features/issues/components/IssueDetailsRail.test.ts` — rail visibility/menu component test.
- **Modify** `src/features/issues/composables/useIssueDraft.ts` — expose `original`.
- **Modify** `src/features/issues/components/IssueDetailsRail.vue` — consume `visibleKeys`/`hiddenFields`, wrap fields, add menu + ×, single-column layout.
- **Modify** `src/views/IssueDetail.vue` — instantiate `useRailFields`, pass props/handlers, reset on save/cancel.

---

## Task 1: Field-descriptor registry + pure visibility helpers

**Files:**
- Create: `src/features/issues/lib/railFields.ts`
- Test: `src/features/issues/lib/railFields.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/issues/lib/railFields.test.ts
import { describe, it, expect } from 'vitest'
import type { IssueDraft } from './issueEdit'
import {
  RAIL_FIELDS,
  railField,
  isFieldVisible,
  visibleFieldKeys,
  hiddenFieldList,
  type RailFieldKey,
} from './railFields'

function makeDraft(over: Partial<IssueDraft> = {}): IssueDraft {
  return {
    title: 'T',
    description: '',
    state: 'opened',
    labelIds: [],
    assigneeUsernames: [],
    milestoneId: null,
    dueDate: '',
    weight: null,
    confidential: false,
    timeEstimate: '',
    statusId: null,
    ...over,
  }
}
const empty = new Set<RailFieldKey>()

describe('railFields registry', () => {
  it('marks status/labels/assignees as pinned and orders fields canonically', () => {
    expect(railField('status').pinned).toBe(true)
    expect(railField('labels').pinned).toBe(true)
    expect(railField('assignees').pinned).toBe(true)
    expect(railField('dueDate').pinned).toBeFalsy()
    const keys = RAIL_FIELDS.map((f) => f.key)
    expect(keys).toEqual([
      'status', 'labels', 'assignees',
      'milestone', 'dueDate', 'weight', 'estimate', 'confidential',
    ])
  })

  it('isPopulated reflects each field value', () => {
    expect(railField('milestone').isPopulated(makeDraft({ milestoneId: 'gid://m/1' }))).toBe(true)
    expect(railField('milestone').isPopulated(makeDraft())).toBe(false)
    expect(railField('dueDate').isPopulated(makeDraft({ dueDate: '2026-06-08' }))).toBe(true)
    expect(railField('dueDate').isPopulated(makeDraft())).toBe(false)
    expect(railField('weight').isPopulated(makeDraft({ weight: 0 }))).toBe(true)
    expect(railField('weight').isPopulated(makeDraft())).toBe(false)
    expect(railField('estimate').isPopulated(makeDraft({ timeEstimate: ' ' }))).toBe(false)
    expect(railField('estimate').isPopulated(makeDraft({ timeEstimate: '2h' }))).toBe(true)
    expect(railField('confidential').isPopulated(makeDraft({ confidential: true }))).toBe(true)
    expect(railField('confidential').isPopulated(makeDraft())).toBe(false)
  })

  it('clear resets each field to empty', () => {
    const d = makeDraft({
      milestoneId: 'gid://m/1', dueDate: '2026-06-08', weight: 3,
      timeEstimate: '2h', confidential: true,
    })
    railField('milestone').clear(d)
    railField('dueDate').clear(d)
    railField('weight').clear(d)
    railField('estimate').clear(d)
    railField('confidential').clear(d)
    expect(d).toMatchObject({
      milestoneId: null, dueDate: '', weight: null, timeEstimate: '', confidential: false,
    })
  })
})

describe('visibility derivation', () => {
  const orig = makeDraft()
  it('pins status/labels/assignees even when empty', () => {
    expect(isFieldVisible(railField('status'), makeDraft(), orig, empty, empty)).toBe(true)
    expect(isFieldVisible(railField('labels'), makeDraft(), orig, empty, empty)).toBe(true)
    expect(isFieldVisible(railField('assignees'), makeDraft(), orig, empty, empty)).toBe(true)
  })
  it('hides an empty, unrevealed value field', () => {
    expect(isFieldVisible(railField('dueDate'), makeDraft(), orig, empty, empty)).toBe(false)
  })
  it('shows a value field populated in the draft', () => {
    expect(isFieldVisible(railField('dueDate'), makeDraft({ dueDate: '2026-06-08' }), orig, empty, empty)).toBe(true)
  })
  it('keeps a field visible when populated in original but cleared in draft (pre-save)', () => {
    const original = makeDraft({ dueDate: '2026-06-08' })
    expect(isFieldVisible(railField('dueDate'), makeDraft(), original, empty, empty)).toBe(true)
  })
  it('shows a revealed empty field, and hides it once removed', () => {
    const revealed = new Set<RailFieldKey>(['dueDate'])
    expect(isFieldVisible(railField('dueDate'), makeDraft(), orig, revealed, empty)).toBe(true)
    const removed = new Set<RailFieldKey>(['dueDate'])
    const original = makeDraft({ dueDate: '2026-06-08' })
    expect(isFieldVisible(railField('dueDate'), makeDraft(), original, empty, removed)).toBe(false)
  })
  it('visibleFieldKeys keeps canonical order and excludes hidden', () => {
    const d = makeDraft({ dueDate: '2026-06-08' })
    expect([...visibleFieldKeys(d, orig, empty, empty)]).toEqual([
      'status', 'labels', 'assignees', 'dueDate',
    ])
  })
  it('hiddenFieldList excludes pinned and visible, in canonical order', () => {
    const d = makeDraft({ dueDate: '2026-06-08' })
    expect(hiddenFieldList(d, orig, empty, empty).map((f) => f.key)).toEqual([
      'milestone', 'weight', 'estimate', 'confidential',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/issues/lib/railFields.test.ts`
Expected: FAIL — cannot find module `./railFields`.

- [ ] **Step 3: Write the registry + helpers**

```ts
// src/features/issues/lib/railFields.ts
import type { IssueDraft } from '@/features/issues/lib/issueEdit'

export type RailFieldKey =
  | 'status'
  | 'labels'
  | 'assignees'
  | 'milestone'
  | 'dueDate'
  | 'weight'
  | 'estimate'
  | 'confidential'

export interface RailFieldDescriptor {
  key: RailFieldKey
  label: string
  /** Menu label override, e.g. "Mark confidential". Falls back to `label`. */
  addLabel?: string
  /** Pinned fields always render and never appear in the Add menu. */
  pinned?: boolean
  isPopulated: (d: IssueDraft) => boolean
  /** The × action: reset this field to its empty value. */
  clear: (d: IssueDraft) => void
}

// Canonical order — drives both the rendered sequence and the Add menu.
export const RAIL_FIELDS: RailFieldDescriptor[] = [
  { key: 'status', label: 'Status', pinned: true, isPopulated: () => true, clear: () => {} },
  {
    key: 'labels',
    label: 'Labels',
    pinned: true,
    isPopulated: (d) => d.labelIds.length > 0,
    clear: (d) => {
      d.labelIds = []
    },
  },
  {
    key: 'assignees',
    label: 'Assignees',
    pinned: true,
    isPopulated: (d) => d.assigneeUsernames.length > 0,
    clear: (d) => {
      d.assigneeUsernames = []
    },
  },
  {
    key: 'milestone',
    label: 'Milestone',
    isPopulated: (d) => d.milestoneId != null,
    clear: (d) => {
      d.milestoneId = null
    },
  },
  {
    key: 'dueDate',
    label: 'Due date',
    isPopulated: (d) => d.dueDate !== '',
    clear: (d) => {
      d.dueDate = ''
    },
  },
  {
    key: 'weight',
    label: 'Weight',
    isPopulated: (d) => d.weight != null,
    clear: (d) => {
      d.weight = null
    },
  },
  {
    key: 'estimate',
    label: 'Estimate',
    isPopulated: (d) => d.timeEstimate.trim() !== '',
    clear: (d) => {
      d.timeEstimate = ''
    },
  },
  {
    key: 'confidential',
    label: 'Confidential',
    addLabel: 'Mark confidential',
    isPopulated: (d) => d.confidential === true,
    clear: (d) => {
      d.confidential = false
    },
  },
]

const BY_KEY = new Map<RailFieldKey, RailFieldDescriptor>(RAIL_FIELDS.map((f) => [f.key, f]))

export function railField(key: RailFieldKey): RailFieldDescriptor {
  const f = BY_KEY.get(key)
  if (!f) throw new Error(`Unknown rail field: ${key}`)
  return f
}

/**
 * A field is visible when pinned, or — unless explicitly removed this session —
 * when revealed this session, populated in the draft, or populated in the
 * last-synced original (so clearing a value keeps the field editable until save).
 */
export function isFieldVisible(
  desc: RailFieldDescriptor,
  draft: IssueDraft,
  original: IssueDraft,
  revealed: ReadonlySet<RailFieldKey>,
  removed: ReadonlySet<RailFieldKey>,
): boolean {
  if (desc.pinned) return true
  if (removed.has(desc.key)) return false
  return revealed.has(desc.key) || desc.isPopulated(draft) || desc.isPopulated(original)
}

export function visibleFieldKeys(
  draft: IssueDraft,
  original: IssueDraft,
  revealed: ReadonlySet<RailFieldKey>,
  removed: ReadonlySet<RailFieldKey>,
): Set<RailFieldKey> {
  return new Set(
    RAIL_FIELDS.filter((f) => isFieldVisible(f, draft, original, revealed, removed)).map(
      (f) => f.key,
    ),
  )
}

export function hiddenFieldList(
  draft: IssueDraft,
  original: IssueDraft,
  revealed: ReadonlySet<RailFieldKey>,
  removed: ReadonlySet<RailFieldKey>,
): RailFieldDescriptor[] {
  return RAIL_FIELDS.filter((f) => !f.pinned && !isFieldVisible(f, draft, original, revealed, removed))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/issues/lib/railFields.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Format + commit**

```bash
bun run format
git add src/features/issues/lib/railFields.ts src/features/issues/lib/railFields.test.ts
git commit -m "feat(rail): field-descriptor registry + visibility helpers"
```

---

## Task 2: `useRailFields` composable

**Files:**
- Create: `src/features/issues/composables/useRailFields.ts`
- Test: `src/features/issues/composables/useRailFields.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/issues/composables/useRailFields.test.ts
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import type { IssueDraft } from '@/features/issues/lib/issueEdit'
import { useRailFields } from './useRailFields'

function makeDraft(over: Partial<IssueDraft> = {}): IssueDraft {
  return {
    title: 'T', description: '', state: 'opened', labelIds: [], assigneeUsernames: [],
    milestoneId: null, dueDate: '', weight: null, confidential: false, timeEstimate: '',
    statusId: null, ...over,
  }
}

describe('useRailFields', () => {
  it('hides empty value fields and lists them in the Add menu', () => {
    const draft = ref(makeDraft())
    const original = ref(makeDraft())
    const { visibleKeys, hiddenFields } = useRailFields(draft, original)
    expect([...visibleKeys.value]).toEqual(['status', 'labels', 'assignees'])
    expect(hiddenFields.value.map((f) => f.key)).toEqual([
      'milestone', 'dueDate', 'weight', 'estimate', 'confidential',
    ])
  })

  it('reveal() shows an empty field and drops it from the Add menu', () => {
    const draft = ref(makeDraft())
    const original = ref(makeDraft())
    const { visibleKeys, hiddenFields, reveal } = useRailFields(draft, original)
    reveal('dueDate')
    expect(visibleKeys.value.has('dueDate')).toBe(true)
    expect(hiddenFields.value.map((f) => f.key)).not.toContain('dueDate')
  })

  it('remove() clears the value, hides the field, then resetReveal() restores derivation', () => {
    const draft = ref(makeDraft({ weight: 5 }))
    const original = ref(makeDraft({ weight: 5 }))
    const { visibleKeys, remove, resetReveal } = useRailFields(draft, original)
    expect(visibleKeys.value.has('weight')).toBe(true)
    remove('weight')
    expect(draft.value.weight).toBeNull()
    expect(visibleKeys.value.has('weight')).toBe(false)
    // After save the buffer re-syncs (original cleared) and the session intent resets:
    original.value = makeDraft()
    resetReveal()
    expect(visibleKeys.value.has('weight')).toBe(false)
  })

  it('tolerates a null draft (renders only pinned)', () => {
    const draft = ref<IssueDraft | null>(null)
    const original = ref<IssueDraft | null>(null)
    const { visibleKeys, hiddenFields } = useRailFields(draft, original)
    expect([...visibleKeys.value]).toEqual(['status', 'labels', 'assignees'])
    expect(hiddenFields.value).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/issues/composables/useRailFields.test.ts`
Expected: FAIL — cannot find module `./useRailFields`.

- [ ] **Step 3: Write the composable**

```ts
// src/features/issues/composables/useRailFields.ts
import { computed, ref, type Ref } from 'vue'
import type { IssueDraft } from '@/features/issues/lib/issueEdit'
import {
  RAIL_FIELDS,
  railField,
  visibleFieldKeys,
  hiddenFieldList,
  type RailFieldDescriptor,
  type RailFieldKey,
} from '@/features/issues/lib/railFields'

const PINNED_KEYS = new Set(RAIL_FIELDS.filter((f) => f.pinned).map((f) => f.key))

/**
 * Owns the transient per-session reveal/removal intent for the Details Rail and
 * derives which fields are visible vs. available in the Add menu. `revealed` and
 * `removed` never persist — they are cleared by `resetReveal()` on save/cancel.
 */
export function useRailFields(
  draft: Ref<IssueDraft | null>,
  original: Ref<IssueDraft | null>,
) {
  const revealed = ref(new Set<RailFieldKey>())
  const removed = ref(new Set<RailFieldKey>())

  const visibleKeys = computed<Set<RailFieldKey>>(() => {
    const d = draft.value
    const o = original.value
    if (!d || !o) return new Set(PINNED_KEYS)
    return visibleFieldKeys(d, o, revealed.value, removed.value)
  })

  const hiddenFields = computed<RailFieldDescriptor[]>(() => {
    const d = draft.value
    const o = original.value
    if (!d || !o) return []
    return hiddenFieldList(d, o, revealed.value, removed.value)
  })

  function reveal(key: RailFieldKey) {
    const r = new Set(removed.value)
    r.delete(key)
    removed.value = r
    const v = new Set(revealed.value)
    v.add(key)
    revealed.value = v
  }

  function remove(key: RailFieldKey) {
    if (draft.value) railField(key).clear(draft.value)
    const v = new Set(revealed.value)
    v.delete(key)
    revealed.value = v
    const r = new Set(removed.value)
    r.add(key)
    removed.value = r
  }

  function resetReveal() {
    if (revealed.value.size) revealed.value = new Set()
    if (removed.value.size) removed.value = new Set()
  }

  return { visibleKeys, hiddenFields, reveal, remove, resetReveal }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/issues/composables/useRailFields.test.ts`
Expected: PASS.

- [ ] **Step 5: Format + commit**

```bash
bun run format
git add src/features/issues/composables/useRailFields.ts src/features/issues/composables/useRailFields.test.ts
git commit -m "feat(rail): useRailFields composable for reveal/removal state"
```

---

## Task 3: Expose `original` from `useIssueDraft`

**Files:**
- Modify: `src/features/issues/composables/useIssueDraft.ts:117`

- [ ] **Step 1: Add `original` to the returned object**

In `src/features/issues/composables/useIssueDraft.ts`, change the final return (line 117) from:

```ts
  return { draft, comment, dirty, saving, error, save, reset }
```

to:

```ts
  // `original` (the last-synced clean snapshot) is exposed so the rail can keep a
  // field visible while its value is cleared but not yet saved.
  return { draft, original, comment, dirty, saving, error, save, reset }
```

- [ ] **Step 2: Run the existing draft tests to confirm nothing broke**

Run: `bunx vitest run src/features/issues/composables/useIssueDraft.test.ts`
Expected: PASS (the addition is purely additive).

- [ ] **Step 3: Commit**

```bash
git add src/features/issues/composables/useIssueDraft.ts
git commit -m "feat(rail): expose original snapshot from useIssueDraft"
```

---

## Task 4: `RailField` wrapper component (label + hover ×)

**Files:**
- Create: `src/features/issues/components/RailField.vue`

- [ ] **Step 1: Write the component**

```vue
<!-- src/features/issues/components/RailField.vue -->
<script setup lang="ts">
import { X } from '@lucide/vue'

defineProps<{ label: string; removable?: boolean }>()
defineEmits<{ remove: [] }>()
</script>

<template>
  <div class="group flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2">
      <span class="field-label">{{ label }}</span>
      <button
        v-if="removable"
        type="button"
        data-testid="rail-field-remove"
        :aria-label="`Remove ${label}`"
        class="opacity-0 text-muted-foreground outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        @click="$emit('remove')"
      >
        <X class="size-3.5" />
      </button>
    </div>
    <slot />
  </div>
</template>
```

- [ ] **Step 2: Commit** (verified by the rail test in Task 7)

```bash
git add src/features/issues/components/RailField.vue
git commit -m "feat(rail): RailField wrapper with hover remove affordance"
```

---

## Task 5: `AddFieldMenu` component

**Files:**
- Create: `src/features/issues/components/AddFieldMenu.vue`

- [ ] **Step 1: Write the component**

```vue
<!-- src/features/issues/components/AddFieldMenu.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Plus } from '@lucide/vue'
import type { RailFieldDescriptor, RailFieldKey } from '@/features/issues/lib/railFields'

defineProps<{ fields: RailFieldDescriptor[] }>()
const emit = defineEmits<{ add: [key: RailFieldKey] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (open.value = false))

function choose(key: RailFieldKey) {
  emit('add', key)
  open.value = false
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      data-testid="add-field-trigger"
      class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      @click="open = !open"
    >
      <Plus class="size-3.5" />
      Add field
    </button>
    <div
      v-if="open"
      class="absolute left-0 z-10 mt-1 min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <button
        v-for="f in fields"
        :key="f.key"
        type="button"
        :data-testid="`add-field-${f.key}`"
        class="flex w-full items-center rounded px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
        @click="choose(f.key)"
      >
        {{ f.addLabel ?? f.label }}
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit** (verified by the rail test in Task 7)

```bash
git add src/features/issues/components/AddFieldMenu.vue
git commit -m "feat(rail): AddFieldMenu trigger + popover"
```

---

## Task 6: Rewrite `IssueDetailsRail` to consume visibility + menu

**Files:**
- Modify: `src/features/issues/components/IssueDetailsRail.vue` (full replacement)

The rail keeps its existing per-field v-models and bindings; it gains `visibleKeys`/`hiddenFields` props, `v-if` gating, `RailField` wrappers with ×, the `AddFieldMenu`, single-column layout, and focus-on-reveal. It stays mutation-free (state lives in the parent).

- [ ] **Step 1: Replace the file with the new implementation**

```vue
<!-- src/features/issues/components/IssueDetailsRail.vue -->
<script setup lang="ts">
import { computed, nextTick } from 'vue'
import StatusPicker from '@/features/issues/components/StatusPicker.vue'
import LabelPicker from '@/features/labels/components/LabelPicker.vue'
import AssigneeEditor from '@/features/assignees/components/AssigneeEditor.vue'
import QuickAssign from '@/features/assignees/components/QuickAssign.vue'
import RailField from '@/features/issues/components/RailField.vue'
import AddFieldMenu from '@/features/issues/components/AddFieldMenu.vue'
import type { WorkItemStatus } from '@/features/issues/composables/useWorkItemStatus'
import type { ProjectMilestone } from '@/features/issues/composables/useProjectMilestones'
import type { IssueDetail } from '@/features/issues/composables/useIssue'
import type { ProjectMember } from '@/features/projects/composables/useProjectMembers'
import type { ProjectContributor } from '@/features/projects/composables/useProjectContributors'
import type { ProjectLabel } from '@/features/labels/composables/useProjectLabels'
import type { RailFieldKey } from '@/features/issues/lib/railFields'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'

const props = defineProps<{
  issue: IssueDetail
  members: ProjectMember[]
  contributors: ProjectContributor[]
  catalog: ProjectLabel[]
  statusOptions: WorkItemStatus[]
  milestones: ProjectMilestone[]
  visibleKeys: Set<RailFieldKey>
  hiddenFields: { key: RailFieldKey; label: string; addLabel?: string }[]
}>()
const emit = defineEmits<{ add: [key: RailFieldKey]; remove: [key: RailFieldKey] }>()

const draftLabelIds = defineModel<string[]>('labelIds', { required: true })
const draftStatusId = defineModel<string | null>('statusId', { required: true })
const draftAssignees = defineModel<string[]>('assigneeUsernames', { required: true })
const draftMilestoneId = defineModel<string | null>('milestoneId', { required: true })
const draftDueDate = defineModel<string>('dueDate', { required: true })
const draftWeight = defineModel<number | null>('weight', { required: true })
const draftConfidential = defineModel<boolean>('confidential', { required: true })
const draftTimeEstimate = defineModel<string>('timeEstimate', { required: true })

const root = ref<HTMLElement | null>(null)

// Reveal is owned by the parent (it holds the draft); we relay the intent and
// then move focus to the freshly shown field's first control.
function onAdd(key: RailFieldKey) {
  emit('add', key)
  nextTick(() => {
    const el = root.value?.querySelector<HTMLElement>(
      `[data-field="${key}"] input, [data-field="${key}"] [role="combobox"], [data-field="${key}"] button`,
    )
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  })
}

// Label id<->title conversion over the catalog prop + the labelIds model.
const draftLabelTitles = computed<string[]>({
  get: () =>
    draftLabelIds.value
      .map((id) => props.catalog.find((l) => l.id === id)?.title)
      .filter((t): t is string => !!t),
  set: (titles) => {
    draftLabelIds.value = titles
      .map((t) => props.catalog.find((l) => l.title === t)?.id)
      .filter((id): id is string => !!id)
  },
})

const currentStatus = computed<WorkItemStatus | null>(
  () => props.statusOptions.find((s) => s.id === draftStatusId.value) ?? null,
)
function onSelectStatus(status: WorkItemStatus) {
  draftStatusId.value = status.id
}

const milestoneValue = computed({
  get: () => draftMilestoneId.value ?? '__none',
  set: (value: string) => {
    draftMilestoneId.value = value === '__none' ? null : value
  },
})

const milestoneOptions = computed(() => {
  const current = props.issue.milestone
  if (!current || props.milestones.some((m) => m.id === current.id)) return props.milestones
  return [{ id: current.id, title: current.title, dueDate: null }, ...props.milestones]
})

const weightText = computed({
  get: () => (draftWeight.value == null ? '' : String(draftWeight.value)),
  set: (value: string) => {
    const trimmed = value.trim()
    draftWeight.value = trimmed === '' ? null : Math.max(0, Number.parseInt(trimmed, 10) || 0)
  },
})
</script>

<template>
  <aside
    ref="root"
    class="issue__meta flex animate-row-in flex-col gap-6 border-y border-border py-6"
    style="animation-delay: 90ms"
  >
    <StatusPicker
      v-if="statusOptions.length"
      :statuses="statusOptions"
      :current="currentStatus"
      label="Status"
      @select="onSelectStatus"
    />

    <LabelPicker v-model="draftLabelTitles" :catalog="catalog" label="Labels" />

    <AssigneeEditor
      v-model:usernames="draftAssignees"
      :issue="issue"
      :members="members"
      :contributors="contributors"
      label="Assignees"
    >
      <template #actions>
        <QuickAssign
          v-model:usernames="draftAssignees"
          :issue="issue"
          :members="members"
          :contributors="contributors"
        />
      </template>
    </AssigneeEditor>

    <RailField
      v-if="visibleKeys.has('milestone')"
      data-field="milestone"
      label="Milestone"
      removable
      @remove="emit('remove', 'milestone')"
    >
      <Select v-model="milestoneValue">
        <SelectTrigger class="h-8 w-full text-xs" aria-label="Milestone">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">None</SelectItem>
          <SelectItem v-for="m in milestoneOptions" :key="m.id" :value="m.id">
            {{ m.title }}
          </SelectItem>
        </SelectContent>
      </Select>
    </RailField>

    <RailField
      v-if="visibleKeys.has('dueDate')"
      data-field="dueDate"
      label="Due date"
      removable
      @remove="emit('remove', 'dueDate')"
    >
      <Input v-model="draftDueDate" type="date" class="h-8 text-xs" aria-label="Due date" />
    </RailField>

    <RailField
      v-if="visibleKeys.has('weight')"
      data-field="weight"
      label="Weight"
      removable
      @remove="emit('remove', 'weight')"
    >
      <Input
        v-model="weightText"
        type="number"
        min="0"
        inputmode="numeric"
        class="h-8 text-xs"
        aria-label="Weight"
        placeholder="None"
      />
    </RailField>

    <RailField
      v-if="visibleKeys.has('estimate')"
      data-field="estimate"
      label="Estimate"
      removable
      @remove="emit('remove', 'estimate')"
    >
      <Input
        v-model="draftTimeEstimate"
        class="h-8 text-xs"
        aria-label="Time estimate"
        placeholder="e.g. 2h 30m"
      />
    </RailField>

    <RailField
      v-if="visibleKeys.has('confidential')"
      data-field="confidential"
      label="Confidential"
      removable
      @remove="emit('remove', 'confidential')"
    >
      <label class="flex items-center gap-2 text-sm text-foreground">
        <Checkbox
          :checked="draftConfidential"
          aria-label="Confidential"
          @update:checked="draftConfidential = $event === true"
        />
        <span>Mark this issue confidential</span>
      </label>
    </RailField>

    <AddFieldMenu v-if="hiddenFields.length" :fields="hiddenFields" @add="onAdd" />
  </aside>
</template>
```

- [ ] **Step 2: Fix the imports** (the template above uses `ref` and `Checkbox`)

In the `<script setup>` import block, change the Vue import line to include `ref`:

```ts
import { computed, nextTick, ref } from 'vue'
```

and add the Checkbox import alongside `Input`:

```ts
import { Checkbox } from '@/shared/ui/checkbox'
```

- [ ] **Step 3: Typecheck the component**

Run: `bunx vue-tsc --noEmit -p tsconfig.json` (or the project's typecheck script — check `package.json` scripts for `typecheck`).
Expected: no errors referencing `IssueDetailsRail.vue`. (It will still error in `IssueDetail.vue` until Task 7 wires the new props — that's expected and fixed next.)

- [ ] **Step 4: Commit**

```bash
bun run format
git add src/features/issues/components/IssueDetailsRail.vue
git commit -m "feat(rail): progressive-disclosure rendering with add menu + remove"
```

---

## Task 7: Component test for the rail

**Files:**
- Create: `src/features/issues/components/IssueDetailsRail.test.ts`

Stub the heavy pinned pickers so the test focuses on visibility, the Add menu, and remove.

- [ ] **Step 1: Write the test**

```ts
// src/features/issues/components/IssueDetailsRail.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueDetailsRail from './IssueDetailsRail.vue'
import { hiddenFieldList, type RailFieldKey } from '@/features/issues/lib/railFields'

const issue = { milestone: null } as never

function makeDraft(over: Record<string, unknown> = {}) {
  return {
    title: 'T', description: '', state: 'opened', labelIds: [], assigneeUsernames: [],
    milestoneId: null, dueDate: '', weight: null, confidential: false, timeEstimate: '',
    statusId: null, ...over,
  }
}

function mountRail(opts: {
  visible: RailFieldKey[]
  hidden?: { key: RailFieldKey; label: string; addLabel?: string }[]
  draft?: Record<string, unknown>
}) {
  const draft = makeDraft(opts.draft)
  return mount(IssueDetailsRail, {
    props: {
      issue,
      members: [],
      contributors: [],
      catalog: [],
      statusOptions: [],
      milestones: [],
      visibleKeys: new Set(opts.visible),
      hiddenFields: opts.hidden ?? [],
      // v-model props
      labelIds: draft.labelIds,
      statusId: draft.statusId,
      assigneeUsernames: draft.assigneeUsernames,
      milestoneId: draft.milestoneId,
      dueDate: draft.dueDate,
      weight: draft.weight,
      confidential: draft.confidential,
      timeEstimate: draft.timeEstimate,
    },
    global: {
      stubs: {
        StatusPicker: true,
        LabelPicker: true,
        AssigneeEditor: true,
        QuickAssign: true,
      },
    },
  })
}

describe('IssueDetailsRail progressive disclosure', () => {
  it('renders only visible non-pinned fields', () => {
    const w = mountRail({ visible: ['status', 'labels', 'assignees', 'dueDate'] })
    expect(w.find('[data-field="dueDate"]').exists()).toBe(true)
    expect(w.find('[data-field="weight"]').exists()).toBe(false)
    expect(w.find('[data-field="milestone"]').exists()).toBe(false)
  })

  it('lists hidden fields in the Add menu and emits add on selection', async () => {
    const hidden = hiddenFieldList(makeDraft(), makeDraft(), new Set(), new Set()).map((f) => ({
      key: f.key,
      label: f.label,
      addLabel: f.addLabel,
    }))
    const w = mountRail({ visible: ['status', 'labels', 'assignees'], hidden })
    await w.get('[data-testid="add-field-trigger"]').trigger('click')
    await w.get('[data-testid="add-field-weight"]').trigger('click')
    expect(w.emitted('add')?.at(-1)).toEqual(['weight'])
  })

  it('shows the confidential add label, not the field label, in the menu', async () => {
    const hidden = [{ key: 'confidential' as const, label: 'Confidential', addLabel: 'Mark confidential' }]
    const w = mountRail({ visible: ['status', 'labels', 'assignees'], hidden })
    await w.get('[data-testid="add-field-trigger"]').trigger('click')
    expect(w.get('[data-testid="add-field-confidential"]').text()).toBe('Mark confidential')
  })

  it('emits remove when a field × is clicked', async () => {
    const w = mountRail({ visible: ['status', 'labels', 'assignees', 'weight'], draft: { weight: 3 } })
    await w.get('[data-field="weight"] [data-testid="rail-field-remove"]').trigger('click')
    expect(w.emitted('remove')?.at(-1)).toEqual(['weight'])
  })

  it('hides the Add menu when nothing is hidden', () => {
    const w = mountRail({
      visible: ['status', 'labels', 'assignees', 'milestone', 'dueDate', 'weight', 'estimate', 'confidential'],
      hidden: [],
    })
    expect(w.find('[data-testid="add-field-trigger"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `bunx vitest run src/features/issues/components/IssueDetailsRail.test.ts`
Expected: PASS. If the date `Input` does not expose an `input` element for the focus query, that does not affect these assertions (focus is exercised manually, not asserted here).

- [ ] **Step 3: Commit**

```bash
git add src/features/issues/components/IssueDetailsRail.test.ts
git commit -m "test(rail): visibility, add menu, and remove behavior"
```

---

## Task 8: Wire `IssueDetail.vue` to the registry

**Files:**
- Modify: `src/views/IssueDetail.vue:52` (destructure `original`), `:144-150` (reset on save), `:166-170` (reset on cancel), `:298-313` (rail props/handlers)

- [ ] **Step 1: Destructure `original` and instantiate `useRailFields`**

Add the import near the other composable imports (after line 12):

```ts
import { useRailFields } from '@/features/issues/composables/useRailFields'
```

Change the draft destructure (line 52) from:

```ts
const { draft, comment, dirty, saving, save, reset, error: saveError } = draftApi
```

to:

```ts
const { draft, original, comment, dirty, saving, save, reset, error: saveError } = draftApi

// Progressive-disclosure state for the Details Rail: which attribute fields are
// shown vs. available in the Add menu. Lives here because the draft does.
const {
  visibleKeys: railVisibleKeys,
  hiddenFields: railHiddenFields,
  reveal: revealRailField,
  remove: removeRailField,
  resetReveal: resetRailFields,
} = useRailFields(draft, original)
```

- [ ] **Step 2: Reset reveal state on save and cancel**

In `onSave` (lines 144-150), add the reset inside the success branch:

```ts
async function onSave() {
  await save()
  if (!dirty.value) {
    editingTitle.value = false
    editingDescription.value = false
    resetRailFields()
  }
}
```

In `onCancel` (lines 166-170), add the reset:

```ts
function onCancel() {
  reset()
  editingTitle.value = false
  editingDescription.value = false
  resetRailFields()
}
```

- [ ] **Step 3: Pass the new props + handlers to the rail**

Replace the `<IssueDetailsRail ... />` block (lines 298-313) with:

```html
      <IssueDetailsRail
        :issue="issue"
        :members="members ?? []"
        :contributors="contributors ?? []"
        :catalog="labelCatalog ?? []"
        :status-options="statusOptions ?? []"
        :milestones="milestones ?? []"
        :visible-keys="railVisibleKeys"
        :hidden-fields="railHiddenFields"
        v-model:label-ids="draft.labelIds"
        v-model:status-id="draft.statusId"
        v-model:assignee-usernames="draft.assigneeUsernames"
        v-model:milestone-id="draft.milestoneId"
        v-model:due-date="draft.dueDate"
        v-model:weight="draft.weight"
        v-model:confidential="draft.confidential"
        v-model:time-estimate="draft.timeEstimate"
        @add="revealRailField"
        @remove="removeRailField"
      />
```

- [ ] **Step 4: Typecheck the whole project**

Run: `bunx vue-tsc --noEmit -p tsconfig.json` (or the project `typecheck` script).
Expected: no errors. (`railVisibleKeys`/`railHiddenFields` are unwrapped refs in template; the rail's `visibleKeys` prop is `Set<RailFieldKey>`, `hiddenFields` is the descriptor list.)

- [ ] **Step 5: Run the full test suite**

Run: `bunx vitest run`
Expected: PASS (all suites, including the existing `useIssueDraft`, `issueEdit`, and the new rail suites).

- [ ] **Step 6: Format + commit**

```bash
bun run format
git add src/views/IssueDetail.vue
git commit -m "feat(rail): wire progressive-disclosure rail into IssueDetail"
```

---

## Task 9: Single-column layout sanity check

The old rail paired Due date + Weight in a two-column grid; the rewrite stacks every field full-width. The parent grid that lifts the rail into a right-hand column at ≥48rem (`IssueDetail.vue` `<style>` `.issue__meta`) is unaffected — only the intra-rail grid was removed.

**Files:**
- Verify only: `src/views/IssueDetail.vue` `<style>` block (no change expected).

- [ ] **Step 1: Confirm no orphaned grid styles reference the removed pairing**

Run: `grep -n "grid-cols-2" src/features/issues/components/IssueDetailsRail.vue`
Expected: no matches (the two-column wrapper is gone).

- [ ] **Step 2: Manual visual check (optional, recommended)**

Use the `run` skill (or `bun run dev`) to open an issue. Confirm: populated fields show; the **+ Add field** menu lists the rest; adding Due date reveals + focuses it; the × collapses a field; saving an emptied field hides it; the rail still floats as a right-hand column on a wide window.

- [ ] **Step 3: No commit needed** (verification only).

---

## Self-review notes

- **Spec coverage:** registry (Task 1), visibility state machine incl. clear-inline-then-save and ×-then-readd (Tasks 1–2), Add menu UX (Tasks 5, 7), per-field × (Tasks 4, 6, 7), pinned set (Task 1), boolean Confidential via the same model (Tasks 1, 6), single-column layout (Tasks 6, 9), reset on save/cancel (Task 8), testing strategy (Tasks 1, 2, 7). The EE value fields (Health/Locked/Iteration/Parent) and the non-draft subsystems are explicitly out of scope here per the spec's phasing.
- **Type consistency:** `RailFieldKey`, `RailFieldDescriptor`, `railField`, `isFieldVisible`, `visibleFieldKeys`, `hiddenFieldList`, and the composable's `visibleKeys`/`hiddenFields`/`reveal`/`remove`/`resetReveal` names are used identically across tasks. The rail prop names (`visibleKeys`, `hiddenFields`) and events (`add`, `remove`) match between Task 6 (definition) and Tasks 7–8 (consumers).
- **No codegen:** nothing in this plan changes a GraphQL document, so `src/gitlab/generated` is untouched and typecheck does not depend on a live-instance codegen run.
