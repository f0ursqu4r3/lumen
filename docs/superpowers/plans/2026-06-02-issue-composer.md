# Issue Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the persistent quick-create bar with an on-demand right-side slide-over composer that creates an issue with title, description, labels, and assignee in one mutation.

**Architecture:** A new `IssueComposer.vue` built on the existing `Sheet` (mirroring `IssueDrawer`). Title + description are always visible; labels + assignee live behind an "Add details" toggle, rendered by two small picker components (`LabelPicker`, `AssigneePicker`). Labels come from the existing `useProjectLabels`; assignees come from a new `useProjectMembers` query. Creation reuses `useCreateIssue` (its input type widened to carry labels/assignee). The composer opens from a header button or the `C` key, closes on success, and the new issue gets a brief flash-highlight in the list.

**Tech Stack:** Vue 3 (`<script setup>`), TypeScript, TanStack Vue Query, graphql-request + graphql-codegen (client preset), Reka UI (Sheet), Tailwind v4, Vitest + @vue/test-utils, bun.

---

## File Structure

**Create:**
- `src/composables/useProjectMembers.ts` — query the project's members for the assignee picker.
- `src/composables/useProjectMembers.test.ts`
- `src/components/LabelPicker.vue` — multi-select labels from the project catalog.
- `src/components/LabelPicker.test.ts`
- `src/components/AssigneePicker.vue` — single-select assignee from project members.
- `src/components/AssigneePicker.test.ts`
- `src/components/IssueComposer.vue` — the slide-over composer.
- `src/components/IssueComposer.test.ts`

**Modify:**
- `src/composables/useIssueMutations.ts:50` — widen `useCreateIssue` input type with `labels?` and `assigneeIds?`.
- `src/composables/useIssueMutations.test.ts` — assert labels/assignee flow into the request.
- `src/components/IssueRow.vue:86-88` — add optional `highlight` prop → `animate-flash`.
- `src/components/IssueRow.test.ts` — assert highlight class.
- `src/components/IssueCard.vue:58-60` — add optional `highlight` prop → `animate-flash`.
- `src/components/IssueCard.test.ts` — assert highlight class.
- `src/styles.css:222` — add the `flash-in` keyframe + `.animate-flash` class.
- `src/views/IssueList.vue` — remove the quick-create bar/state; add header button, `C` shortcut, empty-state button, composer mount, and flash-highlight wiring.
- `src/views/IssueList.test.ts` — replace the old form test; cover the new triggers and highlight.

---

## Task 1: `useProjectMembers` composable

The assignee picker needs project members; the app has no users query today. This mirrors `useProjectLabels` exactly. The response is explicitly typed and the request cast, so the file typechecks even before `bun codegen` registers the new operation.

**Files:**
- Create: `src/composables/useProjectMembers.ts`
- Test: `src/composables/useProjectMembers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/composables/useProjectMembers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useProjectMembers } from './useProjectMembers'

beforeEach(() => {
  request.mockReset()
})

describe('useProjectMembers', () => {
  it('maps the member user nodes, dropping nulls', async () => {
    request.mockResolvedValue({
      project: {
        projectMembers: {
          nodes: [
            { user: { id: 'gid://user/1', username: 'kdougan', name: 'K D', avatarUrl: null } },
            { user: null },
            null,
          ],
        },
      },
    })
    const { result } = withQuery(() => useProjectMembers(ref('grp/proj')))
    await flushPromises()
    expect(result().data.value).toEqual([
      { id: 'gid://user/1', username: 'kdougan', name: 'K D', avatarUrl: null },
    ])
  })

  it('exposes a normalized error', async () => {
    request.mockRejectedValue(new Error('down'))
    const { result } = withQuery(() => useProjectMembers(ref('grp/proj')))
    await flushPromises()
    expect(result().error.value).toMatchObject({ kind: 'unknown', message: 'down' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- src/composables/useProjectMembers.test.ts`
Expected: FAIL — cannot resolve `./useProjectMembers`.

- [ ] **Step 3: Write the composable**

Create `src/composables/useProjectMembers.ts`:

```ts
import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'

// The project's members — used to populate the assignee picker in the issue
// composer. There is no app-wide users query we rely on; previously assignees
// were only known from already-loaded issues.
const ProjectMembersDocument = graphql(`
  query ProjectMembers($fullPath: ID!) {
    project(fullPath: $fullPath) {
      projectMembers(first: 100) {
        nodes {
          user { id username name avatarUrl }
        }
      }
    }
  }
`)

export type ProjectMember = {
  id: string
  username: string
  name: string
  avatarUrl: string | null
}

// Local shape of the response so this file typechecks before `bun codegen`
// registers ProjectMembersDocument (the unregistered graphql() overload is `unknown`).
type ProjectMembersResponse = {
  project?: {
    projectMembers?: { nodes?: ({ user?: ProjectMember | null } | null)[] | null } | null
  } | null
}

async function fetchMembers(fullPath: string): Promise<ProjectMember[]> {
  try {
    const data = (await gqlClient.request(ProjectMembersDocument, {
      fullPath,
    })) as ProjectMembersResponse
    return (
      data.project?.projectMembers?.nodes
        ?.map((n) => n?.user)
        .filter((u): u is ProjectMember => !!u) ?? []
    )
  } catch (e) {
    throw normalizeError(e)
  }
}

export function useProjectMembers(fullPath: Ref<string>) {
  return useQuery<ProjectMember[], GitLabError>({
    queryKey: computed(() => ['members', fullPath.value]),
    queryFn: () => fetchMembers(fullPath.value),
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- src/composables/useProjectMembers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the GraphQL operation with codegen (if the instance is reachable)**

Run: `bun run codegen`
Expected: regenerates `src/gitlab/generated/` and adds a `ProjectMembersDocument` entry to `gql.ts`. This requires the configured `GITLAB_URL`/`GITLAB_TOKEN` (see `codegen.ts`); it runs with TLS verification disabled for the internal-CA instance. If the instance is unreachable, skip — the explicit `ProjectMembersResponse` cast keeps types and tests green; just note codegen is pending.

- [ ] **Step 6: Commit**

```bash
git add src/composables/useProjectMembers.ts src/composables/useProjectMembers.test.ts src/gitlab/generated/
git commit -m "feat: add useProjectMembers query for the assignee picker"
```

---

## Task 2: Widen `useCreateIssue` to carry labels and assignee

`CreateIssueInput` already accepts `labels` (by title) and `assigneeIds`, and `mutationFn` already spreads `...input` into the input object. Only the TypeScript variables type needs widening.

**Files:**
- Modify: `src/composables/useIssueMutations.ts:50`
- Test: `src/composables/useIssueMutations.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('issue mutations', …)` block in `src/composables/useIssueMutations.test.ts`:

```ts
it('useCreateIssue forwards labels and assigneeIds in the input', async () => {
  request.mockResolvedValue({ createIssue: { issue: { iid: '11' }, errors: [] } })
  const { result } = withQuery(() => useCreateIssue('grp/proj'))
  result().mutate({
    title: 'New',
    description: 'body',
    labels: ['bug', 'priority::high'],
    assigneeIds: ['gid://user/1'],
  })
  await flushPromises()
  expect(request).toHaveBeenCalledWith(expect.anything(), {
    input: {
      projectPath: 'grp/proj',
      title: 'New',
      description: 'body',
      labels: ['bug', 'priority::high'],
      assigneeIds: ['gid://user/1'],
    },
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- src/composables/useIssueMutations.test.ts`
Expected: FAIL — TypeScript rejects `labels`/`assigneeIds` on the mutate input (and/or the assertion fails).

- [ ] **Step 3: Widen the input type**

In `src/composables/useIssueMutations.ts`, change the `useCreateIssue` generic (currently line 50):

```ts
  return useMutation<
    CreateIssuePayload,
    GitLabError,
    { title: string; description?: string; labels?: string[]; assigneeIds?: string[] }
  >({
```

No other change is needed — `mutationFn` already does `input: { projectPath: fullPath, ...input }`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- src/composables/useIssueMutations.test.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useIssueMutations.ts src/composables/useIssueMutations.test.ts
git commit -m "feat: let useCreateIssue set labels and assignee"
```

---

## Task 3: `LabelPicker.vue`

A focused multi-select over the project label catalog. Stateless on selection — the parent owns the selected titles via `v-model`.

**Files:**
- Create: `src/components/LabelPicker.vue`
- Test: `src/components/LabelPicker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/LabelPicker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LabelPicker from './LabelPicker.vue'

const catalog = [
  { id: 'l1', title: 'bug', color: '#f00' },
  { id: 'l2', title: 'priority::high', color: '#fa0' },
]

describe('LabelPicker', () => {
  it('opens the panel and toggles a label, emitting selected titles', async () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: [] } })
    await w.get('[data-testid="label-picker-trigger"]').trigger('click')
    await w.get('[data-testid="label-option-bug"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([['bug']])
  })

  it('deselects an already-selected label', async () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: ['bug'] } })
    await w.get('[data-testid="label-picker-trigger"]').trigger('click')
    await w.get('[data-testid="label-option-bug"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([[]])
  })

  it('renders the selected labels as chips', () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: ['bug'] } })
    expect(w.text()).toContain('bug')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- src/components/LabelPicker.test.ts`
Expected: FAIL — cannot resolve `./LabelPicker.vue`.

- [ ] **Step 3: Write the component**

Create `src/components/LabelPicker.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Check, Tag } from '@lucide/vue'
import LabelChip from './LabelChip.vue'
import type { ProjectLabel } from '@/composables/useProjectLabels'

const props = defineProps<{ catalog: ProjectLabel[]; modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [titles: string[]] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (open.value = false))

const selected = (title: string) => props.modelValue.includes(title)

function toggle(title: string) {
  emit(
    'update:modelValue',
    selected(title)
      ? props.modelValue.filter((t) => t !== title)
      : [...props.modelValue, title],
  )
}

const chipFor = (title: string) =>
  props.catalog.find((l) => l.title === title) ?? { title, color: '#888' }
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      data-testid="label-picker-trigger"
      class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      @click="open = !open"
    >
      <Tag class="size-3.5" />
      Labels
    </button>

    <div v-if="modelValue.length" class="mt-2 flex flex-wrap gap-1.5">
      <LabelChip
        v-for="t in modelValue"
        :key="t"
        :title="chipFor(t).title"
        :color="chipFor(t).color"
        closeable
        @remove="toggle(t)"
      />
    </div>

    <div
      v-if="open"
      class="absolute z-50 mt-1 max-h-60 w-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      <button
        v-for="l in catalog"
        :key="l.id"
        type="button"
        :data-testid="`label-option-${l.title}`"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
        @click="toggle(l.title)"
      >
        <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: l.color }" />
        <span class="flex-1 truncate text-foreground">{{ l.title }}</span>
        <Check v-if="selected(l.title)" class="size-3.5 text-primary" />
      </button>
      <p v-if="!catalog.length" class="px-2 py-1.5 text-xs text-muted-foreground">
        No labels in this project.
      </p>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- src/components/LabelPicker.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/LabelPicker.vue src/components/LabelPicker.test.ts
git commit -m "feat: add LabelPicker for selecting project labels"
```

---

## Task 4: `AssigneePicker.vue`

Single-select over project members. Parent owns the selected user id via `v-model` (`string | null`).

**Files:**
- Create: `src/components/AssigneePicker.vue`
- Test: `src/components/AssigneePicker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/AssigneePicker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AssigneePicker from './AssigneePicker.vue'

const members = [
  { id: 'gid://user/1', username: 'kdougan', name: 'K D', avatarUrl: null },
  { id: 'gid://user/2', username: 'mira', name: 'Mira', avatarUrl: null },
]

describe('AssigneePicker', () => {
  it('selects a member, emitting their id', async () => {
    const w = mount(AssigneePicker, { props: { members, modelValue: null } })
    await w.get('[data-testid="assignee-picker-trigger"]').trigger('click')
    await w.get('[data-testid="assignee-option-mira"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['gid://user/2'])
  })

  it('clears when the selected member is clicked again', async () => {
    const w = mount(AssigneePicker, { props: { members, modelValue: 'gid://user/2' } })
    await w.get('[data-testid="assignee-picker-trigger"]').trigger('click')
    await w.get('[data-testid="assignee-option-mira"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([null])
  })

  it('shows the selected member username on the trigger', () => {
    const w = mount(AssigneePicker, { props: { members, modelValue: 'gid://user/1' } })
    expect(w.get('[data-testid="assignee-picker-trigger"]').text()).toContain('kdougan')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- src/components/AssigneePicker.test.ts`
Expected: FAIL — cannot resolve `./AssigneePicker.vue`.

- [ ] **Step 3: Write the component**

Create `src/components/AssigneePicker.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Check, UserPlus } from '@lucide/vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { ProjectMember } from '@/composables/useProjectMembers'

const props = defineProps<{ members: ProjectMember[]; modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [id: string | null] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (open.value = false))

const current = computed(() => props.members.find((m) => m.id === props.modelValue) ?? null)

function select(id: string) {
  emit('update:modelValue', props.modelValue === id ? null : id)
  open.value = false
}
const initial = (m: ProjectMember) => (m.name || m.username).charAt(0).toUpperCase()
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      data-testid="assignee-picker-trigger"
      class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      @click="open = !open"
    >
      <UserPlus class="size-3.5" />
      <span v-if="current" class="font-mono text-foreground">@{{ current.username }}</span>
      <span v-else>Assignee</span>
    </button>

    <div
      v-if="open"
      class="absolute z-50 mt-1 max-h-60 w-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      <button
        v-for="m in members"
        :key="m.id"
        type="button"
        :data-testid="`assignee-option-${m.username}`"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
        @click="select(m.id)"
      >
        <Avatar class="size-5 text-[10px]"><AvatarFallback>{{ initial(m) }}</AvatarFallback></Avatar>
        <span class="flex-1 truncate text-foreground">{{ m.name }} <span class="text-muted-foreground">@{{ m.username }}</span></span>
        <Check v-if="modelValue === m.id" class="size-3.5 text-primary" />
      </button>
      <p v-if="!members.length" class="px-2 py-1.5 text-xs text-muted-foreground">
        No members found.
      </p>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- src/components/AssigneePicker.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/AssigneePicker.vue src/components/AssigneePicker.test.ts
git commit -m "feat: add AssigneePicker for selecting a project member"
```

---

## Task 5: `IssueComposer.vue`

The slide-over. Built on `Sheet`, mirroring `IssueDrawer`. Title + description always visible; labels + assignee behind an "Add details" toggle. Submits via `useCreateIssue`, emits `created` with the new iid, closes and resets on success.

The test mocks the three composables so the component is exercised in isolation (no Vue Query provider needed).

**Files:**
- Create: `src/components/IssueComposer.vue`
- Test: `src/components/IssueComposer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/IssueComposer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const { createMutate, isPending, mutationError } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  isPending: { value: false },
  mutationError: { value: null as unknown },
}))
vi.mock('@/composables/useIssueMutations', () => ({
  useCreateIssue: () => ({ mutate: createMutate, isPending, error: mutationError }),
}))
vi.mock('@/composables/useProjectLabels', () => ({
  useProjectLabels: () => ({ data: ref([{ id: 'l1', title: 'bug', color: '#f00' }]) }),
}))
vi.mock('@/composables/useProjectMembers', () => ({
  useProjectMembers: () => ({
    data: ref([{ id: 'gid://user/1', username: 'kdougan', name: 'K D', avatarUrl: null }]),
  }),
}))

import IssueComposer from './IssueComposer.vue'

const mountComposer = () =>
  mount(IssueComposer, {
    props: { open: true, fullPath: 'grp/proj' },
    attachTo: document.body,
  })

beforeEach(() => {
  createMutate.mockReset()
  isPending.value = false
  mutationError.value = null
})

describe('IssueComposer', () => {
  it('disables Create until the title is non-empty', async () => {
    const w = mountComposer()
    const submit = w.get('[data-testid="composer-submit"]')
    expect(submit.attributes('disabled')).toBeDefined()
    await w.get('[data-testid="composer-title"]').setValue('Fix it')
    expect(submit.attributes('disabled')).toBeUndefined()
  })

  it('hides labels/assignee until "Add details" is clicked', async () => {
    const w = mountComposer()
    expect(w.find('[data-testid="label-picker-trigger"]').exists()).toBe(false)
    await w.get('[data-testid="composer-add-details"]').trigger('click')
    expect(w.find('[data-testid="label-picker-trigger"]').exists()).toBe(true)
    expect(w.find('[data-testid="assignee-picker-trigger"]').exists()).toBe(true)
  })

  it('submits title, description, labels and assigneeIds', async () => {
    const w = mountComposer()
    await w.get('[data-testid="composer-title"]').setValue('Fix it')
    await w.get('[data-testid="composer-description"]').setValue('details')
    await w.get('[data-testid="composer-add-details"]').trigger('click')
    await w.get('[data-testid="label-picker-trigger"]').trigger('click')
    await w.get('[data-testid="label-option-bug"]').trigger('click')
    await w.get('[data-testid="assignee-picker-trigger"]').trigger('click')
    await w.get('[data-testid="assignee-option-kdougan"]').trigger('click')
    await w.get('[data-testid="composer-form"]').trigger('submit.prevent')
    expect(createMutate).toHaveBeenCalledWith(
      {
        title: 'Fix it',
        description: 'details',
        labels: ['bug'],
        assigneeIds: ['gid://user/1'],
      },
      expect.anything(),
    )
  })

  it('omits empty optional fields from the payload', async () => {
    const w = mountComposer()
    await w.get('[data-testid="composer-title"]').setValue('Just a title')
    await w.get('[data-testid="composer-form"]').trigger('submit.prevent')
    expect(createMutate).toHaveBeenCalledWith({ title: 'Just a title' }, expect.anything())
  })

  it('emits created with the new iid and requests close on success', async () => {
    createMutate.mockImplementation((_vars, opts) => opts.onSuccess({ issue: { iid: '42' } }))
    const w = mountComposer()
    await w.get('[data-testid="composer-title"]').setValue('Fix it')
    await w.get('[data-testid="composer-form"]').trigger('submit.prevent')
    await flushPromises()
    expect(w.emitted('created')?.at(-1)).toEqual(['42'])
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- src/components/IssueComposer.test.ts`
Expected: FAIL — cannot resolve `./IssueComposer.vue`.

- [ ] **Step 3: Write the component**

Create `src/components/IssueComposer.vue`:

```vue
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Plus, LoaderCircle, ChevronDown } from '@lucide/vue'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import ErrorNotice from './ErrorNotice.vue'
import LabelPicker from './LabelPicker.vue'
import AssigneePicker from './AssigneePicker.vue'
import { useCreateIssue } from '@/composables/useIssueMutations'
import { useProjectLabels } from '@/composables/useProjectLabels'
import { useProjectMembers } from '@/composables/useProjectMembers'

const props = defineProps<{ open: boolean; fullPath: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; created: [iid: string] }>()

const fullPathRef = computed(() => props.fullPath)
const { data: labels } = useProjectLabels(fullPathRef)
const { data: members } = useProjectMembers(fullPathRef)
const create = useCreateIssue(props.fullPath)

const title = ref('')
const description = ref('')
const selectedLabels = ref<string[]>([])
const assigneeId = ref<string | null>(null)
const showDetails = ref(false)

const titleInput = ref<{ $el: HTMLInputElement } | null>(null)

// Reset and refocus each time the sheet opens, so it always starts clean.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    title.value = ''
    description.value = ''
    selectedLabels.value = []
    assigneeId.value = null
    showDetails.value = false
    nextTick(() => titleInput.value?.$el?.focus())
  },
)

const canSubmit = computed(() => !!title.value.trim() && !create.isPending.value)

function submit() {
  if (!title.value.trim()) return
  const input: {
    title: string
    description?: string
    labels?: string[]
    assigneeIds?: string[]
  } = { title: title.value.trim() }
  if (description.value.trim()) input.description = description.value
  if (selectedLabels.value.length) input.labels = selectedLabels.value
  if (assigneeId.value) input.assigneeIds = [assigneeId.value]

  create.mutate(input, {
    onSuccess: (data) => {
      if (data?.issue?.iid) emit('created', data.issue.iid)
      emit('update:open', false)
    },
  })
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
      <SheetHeader class="border-b px-4 py-3">
        <SheetTitle class="text-sm">New issue</SheetTitle>
        <SheetDescription class="sr-only">Create a new issue in this project</SheetDescription>
      </SheetHeader>

      <form
        data-testid="composer-form"
        class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
        @submit.prevent="submit"
      >
        <Input
          ref="titleInput"
          v-model="title"
          data-testid="composer-title"
          placeholder="Issue title…"
          aria-label="Issue title"
        />
        <Textarea
          v-model="description"
          data-testid="composer-description"
          placeholder="Description (optional)…"
          aria-label="Issue description"
          class="min-h-28"
        />

        <button
          v-if="!showDetails"
          type="button"
          data-testid="composer-add-details"
          class="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:underline"
          @click="showDetails = true"
        >
          <ChevronDown class="size-3.5" />
          Add details
        </button>

        <div v-else class="flex flex-col gap-3">
          <LabelPicker v-model="selectedLabels" :catalog="labels ?? []" />
          <AssigneePicker v-model="assigneeId" :members="members ?? []" />
        </div>

        <ErrorNotice v-if="create.error.value" :error="create.error.value" />

        <div class="mt-auto flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" @click="emit('update:open', false)">Cancel</Button>
          <Button type="submit" data-testid="composer-submit" :disabled="!canSubmit">
            <LoaderCircle v-if="create.isPending.value" class="animate-spin" />
            <Plus v-else />
            Create
          </Button>
        </div>
      </form>
    </SheetContent>
  </Sheet>
</template>
```

> Note: the confirmation flash lives in the list (Task 6), not in the composer.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- src/components/IssueComposer.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/IssueComposer.vue src/components/IssueComposer.test.ts
git commit -m "feat: add IssueComposer slide-over for creating issues"
```

---

## Task 6: Flash-highlight support in `IssueRow` and `IssueCard`

Add an optional `highlight` prop to both. When true, apply a brief amber wash that fades — the no-toast confirmation for a freshly created issue.

**Files:**
- Modify: `src/styles.css:222`
- Modify: `src/components/IssueRow.vue:30` (props) and `:86` (root class)
- Modify: `src/components/IssueCard.vue:19` (props) and `:58` (root class)
- Test: `src/components/IssueRow.test.ts`, `src/components/IssueCard.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/components/IssueRow.test.ts` inside its `describe`:

```ts
  it('applies the flash-highlight class when highlight is true', () => {
    const w = mount(IssueRow, {
      props: { issue, fullPath: 'grp/proj', highlight: true },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.get('div').classes()).toContain('animate-flash')
  })
```

Append to `src/components/IssueCard.test.ts` inside its `describe` (mirror the existing mount in that file; add `highlight: true` to props and assert the root `div` has `animate-flash`):

```ts
  it('applies the flash-highlight class when highlight is true', () => {
    const w = mount(IssueCard, {
      props: { issue, fullPath: 'grp/proj', highlight: true },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.get('div').classes()).toContain('animate-flash')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- src/components/IssueRow.test.ts src/components/IssueCard.test.ts`
Expected: FAIL — `animate-flash` not present (and `highlight` is not a declared prop).

- [ ] **Step 3: Add the keyframe to `styles.css`**

Append to `src/styles.css` (after the `@media (prefers-reduced-motion: no-preference)` block ending at line 222):

```css
/* New-issue confirmation: a brief amber wash that fades, so a freshly created
   issue announces itself in the list without a toast. Kin to .animate-status. */
@keyframes flash-in {
  0% {
    background-color: oklch(0.82 0.142 81 / 0.16);
  }
  100% {
    background-color: transparent;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .animate-flash {
    animation: flash-in 1.6s ease-out both;
  }
}
```

- [ ] **Step 4: Add the prop + class to `IssueRow.vue`**

In `src/components/IssueRow.vue`, extend the props (currently lines 28-32):

```ts
const props = defineProps<{
  issue: IssueListItem
  fullPath: string
  index?: number
  highlight?: boolean
}>()
```

And on the root `<div>` (line 86), add a class binding alongside the existing `:style`:

```vue
  <div
    class="group relative flex animate-row-in items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-accent/60 focus-within:bg-accent/60"
    :class="{ 'animate-flash': highlight }"
    :style="{ animationDelay: delay }"
```

- [ ] **Step 5: Add the prop + class to `IssueCard.vue`**

In `src/components/IssueCard.vue`, extend the props (line 19):

```ts
const props = defineProps<{ issue: IssueListItem; fullPath: string; highlight?: boolean }>()
```

And on the root `<div>` (line 58):

```vue
  <div
    class="group relative flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 transition-colors duration-150 hover:border-border/0 hover:bg-accent/50 focus-within:bg-accent/50"
    :class="{ 'animate-flash': highlight }"
  >
```

> Note: `IssueCard.vue` references `props` already; if its `defineProps` is currently
> destructured without a `props` binding, keep the existing form and add `highlight` to it.
> The template uses `highlight` directly, which works with either `<script setup>` form.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test -- src/components/IssueRow.test.ts src/components/IssueCard.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/styles.css src/components/IssueRow.vue src/components/IssueRow.test.ts src/components/IssueCard.vue src/components/IssueCard.test.ts
git commit -m "feat: add flash-highlight to issue row and card"
```

---

## Task 7: Wire the composer into `IssueList.vue` and remove the bar

Remove the persistent quick-create form and its state. Add the header "New issue" button, the `C` shortcut, the empty-state button, the composer mount, and the flash-highlight wiring (set on `created`, cleared on a timer, passed to rows/cards).

**Files:**
- Modify: `src/views/IssueList.vue`
- Test: `src/views/IssueList.test.ts`

- [ ] **Step 1: Update the failing tests**

In `src/views/IssueList.test.ts`:

1. Update the `useIssueMutations` mock to drop `useCreateIssue` usage assertions tied to the form (keep the mock export so the composer's import resolves), and add mocks for the composer's other composables. Replace the existing `vi.mock('@/composables/useProjectLabels', …)` block and add a members mock:

```ts
vi.mock('@/composables/useProjectLabels', () => ({
  useProjectLabels: () => ({ data: ref([]) }),
}))
vi.mock('@/composables/useProjectMembers', () => ({
  useProjectMembers: () => ({ data: ref([]) }),
}))
```

2. Delete the test `'creates an issue from the new-issue form'` (the form is gone).

3. Add these tests inside the `describe('IssueList', …)`:

```ts
  it('has no persistent quick-create bar', () => {
    mockQuery({ issues: ref([]) })
    const w = mountList()
    expect(w.find('input[placeholder="New issue title…"]').exists()).toBe(false)
  })

  it('opens the composer from the header New issue button', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    await w.get('[data-testid="new-issue"]').trigger('click')
    expect(w.findComponent(IssueComposer).props('open')).toBe(true)
  })

  it('opens the composer when the C key is pressed', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    await flushPromises()
    expect(w.findComponent(IssueComposer).props('open')).toBe(true)
  })

  it('does not open the composer on C while the drawer is open', async () => {
    mockQuery({ issues: ref([issue]) })
    await router.replace('/?issue=7')
    await router.isReady()
    const w = mountList()
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    await flushPromises()
    expect(w.findComponent(IssueComposer).props('open')).toBe(false)
  })

  it('highlights the newly created issue when the composer emits created', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    await flushPromises()
    w.findComponent(IssueComposer).vm.$emit('created', '7')
    await flushPromises()
    expect(w.findComponent(IssueRow).props('highlight')).toBe(true)
  })
```

4. Add the imports at the top of the test file:

```ts
import IssueComposer from '@/components/IssueComposer.vue'
import IssueRow from '@/components/IssueRow.vue'
```

5. In `mountList`, stub the composer so its internals don't need a query provider, but keep it findable with props:

```ts
const mountList = () =>
  mount(IssueList, {
    props: { fullPath: 'grp/proj' },
    global: {
      plugins: [router],
      stubs: { RouterLink: RouterLinkStub, IssueDrawer: true, IssueComposer: true },
    },
  })
```

> `stubs: { IssueComposer: true }` renders a stub that still reports props and emits — so
> `props('open')` and `$emit('created', …)` work without mounting the real composer.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- src/views/IssueList.test.ts`
Expected: FAIL — `[data-testid="new-issue"]` not found, composer not mounted, etc.

- [ ] **Step 3: Remove the old quick-create state from `IssueList.vue`**

In `src/views/IssueList.vue`, delete the entire quick-create block (currently lines 195-214):

```ts
const createIssue = useCreateIssue(props.fullPath)
const newTitle = ref('')
const justCreated = ref(false)
let createdTimer: ReturnType<typeof setTimeout> | undefined
function submitNew() { /* … */ }
```

And remove the now-unused `useCreateIssue` import from the `@/composables/useIssueMutations` import (keep `useRetagIssue`). Remove `Check` and `LoaderCircle` from the `@lucide/vue` import **only if** they are not used elsewhere in the file — `LoaderCircle` IS still used by the "Load more" button (line 566), so keep it; `Check` is only used by the old form, so remove it.

- [ ] **Step 4: Add composer state, the `C` shortcut, and highlight state**

In `src/views/IssueList.vue` `<script setup>`, add the imports:

```ts
import { onKeyStroke } from '@vueuse/core'
import IssueComposer from '@/components/IssueComposer.vue'
```

And add this state (e.g. after the drag-to-retag section):

```ts
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

// `C` opens the composer — but never while typing or with another surface open.
onKeyStroke('c', (e) => {
  const t = e.target as HTMLElement | null
  if (t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return
  if (composerOpen.value || openIid.value) return
  e.preventDefault()
  composerOpen.value = true
})
```

- [ ] **Step 5: Add the header button**

In the header block (`IssueList.vue:239`), add a "New issue" button. Replace the count wrapper's opening so the button sits beside the count — insert before the count `<div>`:

```vue
      <div class="flex shrink-0 items-center gap-3">
        <Button data-testid="new-issue" @click="composerOpen = true">
          <Plus />
          New issue
        </Button>
        <div
          class="hidden flex-col items-end transition-opacity sm:flex"
          :class="isLoading ? 'opacity-0' : 'opacity-100'"
        >
          <!-- existing count markup unchanged -->
        </div>
      </div>
```

(`Plus` and `Button` are already imported.)

- [ ] **Step 6: Delete the quick-create form from the template**

Remove the entire `<!-- Quick create -->` `<form>` block (currently lines 415-438) and the stray create-error notice that follows it (lines 440-443):

```vue
    <ErrorNotice v-if="createIssue.error.value" :error="createIssue.error.value" />
```

Keep the list-level `<ErrorNotice v-if="error" :error="error" />`.

- [ ] **Step 7: Pass `highlight` to rows and cards, and add the empty-state button**

On the `IssueRow` (line 486) add:

```vue
              <IssueRow
                v-for="(issue, i) in g.issues"
                :key="issue.iid"
                :issue="issue"
                :full-path="fullPath"
                :index="i"
                :highlight="issue.iid === highlightIid"
                @filter="applyFacet"
              />
```

On the `IssueCard` (line 544) add `:highlight="issue.iid === highlightIid"`.

In the empty state (line 583), add a button after the helper text:

```vue
        <Button data-testid="empty-new-issue" class="mt-1" @click="composerOpen = true">
          <Plus />
          Create issue
        </Button>
```

- [ ] **Step 8: Mount the composer**

Just before the closing `</section>` (after `IssueDrawer`, line 597), add:

```vue
    <IssueComposer
      :open="composerOpen"
      :full-path="fullPath"
      @update:open="composerOpen = $event"
      @created="onCreated"
    />
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `bun run test -- src/views/IssueList.test.ts`
Expected: PASS (all tests, including the new trigger/highlight cases).

- [ ] **Step 10: Run the full suite + typecheck**

Run: `bun run test && bun run typecheck`
Expected: all tests PASS; `vue-tsc` reports no errors.

- [ ] **Step 11: Commit**

```bash
git add src/views/IssueList.vue src/views/IssueList.test.ts
git commit -m "feat: replace quick-create bar with the issue composer"
```

---

## Final verification

- [ ] Run `bun run test` — full suite green.
- [ ] Run `bun run typecheck` — no `vue-tsc` errors.
- [ ] Manual smoke (optional, needs the live instance): `bun run dev`, open a project, press `C` and click "New issue"; create with and without details; confirm the new issue appears at the top with a brief amber flash and the composer closed.

---

## Spec coverage check

- Remove persistent bar → Task 7 (steps 3, 6).
- Slide-over composer on Sheet, mirrors IssueDrawer → Task 5.
- Progressive disclosure (title+desc visible; labels+assignee behind "Add details") → Task 5.
- Labels via useProjectLabels, by name → Tasks 3, 5.
- Assignee via new useProjectMembers, single-select, assigneeIds → Tasks 1, 4, 5.
- One-shot create with all fields → Task 2 + Task 5.
- Triggers: header button, `C` key, empty-state button → Task 7 (steps 4, 5, 7).
- After create: close + flash-highlight new issue at top → Task 5 (emit/close) + Task 6 (animation) + Task 7 (wiring).
- Errors inside the composer via ErrorNotice → Task 5.
- Tests for composer, members, list, row/card → Tasks 1, 3, 4, 5, 6, 7.

## Out of scope (per spec)

Milestone, due date, confidential, weight; multi-assignee; turning create into an edit surface.
