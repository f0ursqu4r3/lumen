# Editable Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user edit comments they authored, inline in the issue/MR UI and via the MCP server, with edits scoped to their own (non-system) comments.

**Architecture:** Wire up GitLab's existing `updateNote` mutation. Two new vue-query mutation composables (`useUpdateNote`, `useMrUpdateNote`) drive inline edit-in-place state added to the discussion components; ownership is gated on `note.author.username === currentUser.username` via the existing `useCurrentUser`. Two new MCP tools (`lumen_issue_comment_edit`, `lumen_mr_comment_edit`) enforce the same own-only rule server-side after exposing note ids in the MCP read tools.

**Tech Stack:** Vue 3 + TS, `@tanstack/vue-query`, raw-string GraphQL via `gqlClient.request`, Bun MCP server (`gql` helper), Vitest (`bunx vitest run`).

---

## Plan-Time Refinement (post-code-read)

`src/features/issues/composables/useIssueMutations.ts` uses codegen-tagged `graphql()` documents for its existing mutations; adding an `UpdateNote` via `graphql()` would require a user-run `bun codegen` against the live instance (generated types are gitignored), turning the typecheck red until then. To avoid that round-trip, the new `useUpdateNote` uses the **raw-string `gqlClient.request<T, V>(...)` pattern** already established in `useMrDiscussion.ts` and `useCurrentUser.ts`. This is a deliberate local deviation from the neighboring `graphql()` calls and needs **no codegen**.

## File Map

- `src/features/issues/composables/useIssueMutations.ts` — add `useUpdateNote` (raw-string). Test: `useIssueMutations.test.ts`.
- `src/features/merge_requests/composables/useMrDiscussion.ts` — add `useMrUpdateNote`. Test: `useMrDiscussion.test.ts`.
- `src/features/issues/composables/useIssueDiscussion.ts` — add edit state (`editingNoteId`, `editBody`, `editPending`, `editError`, `openEdit`, `cancelEdit`, `submitEdit`). Test (new): `useIssueDiscussion.test.ts`.
- `src/features/issues/components/IssueDiscussion.vue` — inline edit UI + own-note gate. Test (new): `IssueDiscussion.test.ts`.
- `src/features/merge_requests/components/MrDiscussion.vue` — inline edit UI + state + own-note gate. Test: `MrDiscussion.test.ts`.
- `src/bun/mcp/gitlab/issues.ts` — add note `id` to `GET_Q`; add `lumen_issue_comment_edit`. Test: `issues.test.ts`.
- `src/bun/mcp/gitlab/mergeRequests.ts` — add note `id` to `GET_Q`; add `lumen_mr_comment_edit`. Test: `mergeRequests.test.ts`.

Reference facts confirmed from the code:
- Issue note query (`useIssue.ts`) already selects `id`, `body`, `system`, `author { username }`; `IssueDetail.vue:119` drops system notes before they reach `IssueDiscussion`.
- MR note query (`useMergeRequest.ts`) selects `id`, `body`, `bodyHtml`, `system`, `author { name username }`; `MergeRequestDetail.vue` drops system notes.
- Issue discussion query key: `['issue', fullPath, iid]`. MR key: `mrKey(fullPath, iid)` → `['merge-request', fullPath, iid]`.
- `useCurrentUser()` returns a query whose `.data` is the username string (or null).

---

### Task 1: `useUpdateNote` composable (issues)

**Files:**
- Modify: `src/features/issues/composables/useIssueMutations.ts`
- Test: `src/features/issues/composables/useIssueMutations.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/issues/composables/useIssueMutations.test.ts`. Match the existing file's harness (it already imports `withQuery`, `flushPromises`, `notifyManager`, mocks `@/gitlab/client`'s `gqlClient.request` as `request`). Add `useUpdateNote` to the existing import from `./useIssueMutations`.

```ts
describe('useUpdateNote', () => {
  it('sends the note id and new body', async () => {
    request.mockResolvedValue({ updateNote: { note: { id: 'n1', body: 'edited' }, errors: [] } })
    const { result } = withQuery(() => useUpdateNote('grp/proj', '7'))
    await result().mutateAsync({ id: 'gid://Note/1', body: 'edited' })
    await flushPromises()
    expect(request.mock.calls[0][1]).toEqual({ input: { id: 'gid://Note/1', body: 'edited' } })
  })

  it('rejects on a mutation-level errors[] payload', async () => {
    request.mockResolvedValue({ updateNote: { note: null, errors: ['permission denied'] } })
    const { result } = withQuery(() => useUpdateNote('grp/proj', '7'))
    await expect(result().mutateAsync({ id: 'x', body: 'b' })).rejects.toMatchObject({
      kind: 'graphql',
      message: 'permission denied',
    })
  })

  it('invalidates the issue detail query on success', async () => {
    request.mockResolvedValue({ updateNote: { note: { id: 'n1', body: 'b' }, errors: [] } })
    const { result, queryClient } = withQuery(() => useUpdateNote('grp/proj', '7'))
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    await result().mutateAsync({ id: 'gid://Note/1', body: 'b' })
    await flushPromises()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issue', 'grp/proj', '7'] })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/features/issues/composables/useIssueMutations.test.ts`
Expected: FAIL — `useUpdateNote is not exported` / not a function.

- [ ] **Step 3: Implement `useUpdateNote`**

In `src/features/issues/composables/useIssueMutations.ts`, add the import for `gqlClient` if not present (it is — line 3). Add the document, payload type, and composable. Place the document near the other `*Document` consts and the composable after `useAddNote` (around line 124):

```ts
// Raw-string (not codegen graphql()) so editing notes needs no `bun codegen`.
const UpdateNoteDocument = `
  mutation UpdateNote($input: UpdateNoteInput!) {
    updateNote(input: $input) {
      note { id body bodyHtml }
      errors
    }
  }
`
type UpdateNotePayload = {
  note?: { id: string; body: string; bodyHtml?: string | null } | null
  errors: string[]
}

// Edit an existing note by its global id. Invalidates the issue detail query so
// the rendered body refreshes on the next fetch.
export function useUpdateNote(fullPath: string, iid: string) {
  const qc = useQueryClient()
  return useMutation<UpdateNotePayload, GitLabError, { id: string; body: string }>({
    mutationFn: (input) =>
      run(
        () =>
          gqlClient.request<{ updateNote: UpdateNotePayload }, { input: { id: string; body: string } }>(
            UpdateNoteDocument,
            { input },
          ),
        (d: { updateNote?: UpdateNotePayload | null }) => d.updateNote,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issue', fullPath, iid] }),
  })
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bunx vitest run src/features/issues/composables/useIssueMutations.test.ts`
Expected: PASS (all `useUpdateNote` cases green, existing cases unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/composables/useIssueMutations.ts src/features/issues/composables/useIssueMutations.test.ts
git commit -m "feat(issues): useUpdateNote mutation composable"
```

---

### Task 2: `useMrUpdateNote` composable (merge requests)

**Files:**
- Modify: `src/features/merge_requests/composables/useMrDiscussion.ts`
- Test: `src/features/merge_requests/composables/useMrDiscussion.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/merge_requests/composables/useMrDiscussion.test.ts` (it already mocks `gqlClient.request` as `request` and sets up `notifyManager`). Add `useMrUpdateNote` to the import from `./useMrDiscussion`.

```ts
describe('useMrUpdateNote', () => {
  it('sends the note id and new body', async () => {
    request.mockResolvedValue({ updateNote: { note: { id: 'n1', body: 'edited' }, errors: [] } })
    const { result } = withQuery(() => useMrUpdateNote('grp/proj', '5'))
    await result().mutateAsync({ id: 'gid://Note/1', body: 'edited' })
    await flushPromises()
    expect(request.mock.calls[0][1]).toEqual({ input: { id: 'gid://Note/1', body: 'edited' } })
  })

  it('rejects on a mutation-level errors[] payload', async () => {
    request.mockResolvedValue({ updateNote: { note: null, errors: ['permission denied'] } })
    const { result } = withQuery(() => useMrUpdateNote('grp/proj', '5'))
    await expect(result().mutateAsync({ id: 'x', body: 'b' })).rejects.toMatchObject({
      kind: 'graphql',
      message: 'permission denied',
    })
  })

  it('invalidates the MR detail query on success', async () => {
    request.mockResolvedValue({ updateNote: { note: { id: 'n1', body: 'b' }, errors: [] } })
    const { result, queryClient } = withQuery(() => useMrUpdateNote('grp/proj', '5'))
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    await result().mutateAsync({ id: 'gid://Note/1', body: 'b' })
    await flushPromises()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['merge-request', 'grp/proj', '5'] })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/features/merge_requests/composables/useMrDiscussion.test.ts`
Expected: FAIL — `useMrUpdateNote is not exported`.

- [ ] **Step 3: Implement `useMrUpdateNote`**

In `src/features/merge_requests/composables/useMrDiscussion.ts`, add after `useMrAddNote` (line 48):

```ts
const UpdateNoteDocument = `
  mutation UpdateMrNote($input: UpdateNoteInput!) {
    updateNote(input: $input) {
      note { id body bodyHtml }
      errors
    }
  }
`

type UpdateNoteResult = {
  updateNote?: { note?: { id: string; body: string } | null; errors?: string[] | null } | null
}
type UpdateNoteInput = { id: string; body: string }

async function sendUpdateNote(input: UpdateNoteInput): Promise<UpdateNoteResult['updateNote']> {
  let data: UpdateNoteResult
  try {
    data = await gqlClient.request<UpdateNoteResult, { input: UpdateNoteInput }>(UpdateNoteDocument, {
      input,
    })
  } catch (e) {
    throw normalizeError(e)
  }
  const errors = data.updateNote?.errors
  if (errors?.length) throw { kind: 'graphql', message: errors[0] } satisfies GitLabError
  return data.updateNote ?? null
}

/** Edit an existing MR note by its global id. Invalidates the MR detail query. */
export function useMrUpdateNote(fullPath: string, iid: string) {
  const qc = useQueryClient()
  return useMutation<UpdateNoteResult['updateNote'], GitLabError, UpdateNoteInput>({
    mutationFn: sendUpdateNote,
    onSuccess: () => qc.invalidateQueries({ queryKey: mrKey(fullPath, iid) }),
  })
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bunx vitest run src/features/merge_requests/composables/useMrDiscussion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/merge_requests/composables/useMrDiscussion.ts src/features/merge_requests/composables/useMrDiscussion.test.ts
git commit -m "feat(mr): useMrUpdateNote mutation composable"
```

---

### Task 3: Edit state in `useIssueDiscussion`

**Files:**
- Modify: `src/features/issues/composables/useIssueDiscussion.ts`
- Test (create): `src/features/issues/composables/useIssueDiscussion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/issues/composables/useIssueDiscussion.test.ts`. Mock `useIssueMutations` so both note hooks are controllable, avoiding the gqlClient layer.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { flushPromises } from '@vue/test-utils'

const add = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: { value: false },
  error: { value: null as unknown },
}))
const edit = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: { value: false },
  error: { value: null as unknown },
}))
vi.mock('@/features/issues/composables/useIssueMutations', () => ({
  useAddNote: () => add,
  useUpdateNote: () => edit,
}))

import { useIssueDiscussion } from './useIssueDiscussion'

function setup() {
  return useIssueDiscussion({
    fullPath: 'grp/proj',
    iid: '7',
    issue: computed(() => ({ id: 'gid://Issue/1' })),
    notes: ref([{ id: 'n1' }]),
  })
}

beforeEach(() => {
  edit.mutateAsync.mockReset()
  edit.reset.mockReset()
  edit.isPending.value = false
  edit.error.value = null
})

describe('useIssueDiscussion edit', () => {
  it('openEdit prefills the body and marks the note as editing', () => {
    const d = setup()
    d.openEdit({ id: 'n1', body: 'hello' })
    expect(d.editingNoteId.value).toBe('n1')
    expect(d.editBody.value).toBe('hello')
  })

  it('submitEdit sends id + trimmed body and clears editing on success', async () => {
    edit.mutateAsync.mockResolvedValue({ note: { id: 'n1', body: 'changed' } })
    const d = setup()
    d.openEdit({ id: 'n1', body: 'hello' })
    d.editBody.value = '  changed  '
    await d.submitEdit('n1')
    await flushPromises()
    expect(edit.mutateAsync).toHaveBeenCalledWith({ id: 'n1', body: 'changed' })
    expect(d.editingNoteId.value).toBe(null)
  })

  it('submitEdit no-ops on an empty body', async () => {
    const d = setup()
    d.openEdit({ id: 'n1', body: 'hello' })
    d.editBody.value = '   '
    await d.submitEdit('n1')
    expect(edit.mutateAsync).not.toHaveBeenCalled()
    expect(d.editingNoteId.value).toBe('n1')
  })

  it('submitEdit keeps editing open when the mutation rejects', async () => {
    edit.mutateAsync.mockRejectedValue({ kind: 'graphql', message: 'nope' })
    const d = setup()
    d.openEdit({ id: 'n1', body: 'hello' })
    d.editBody.value = 'changed'
    await d.submitEdit('n1')
    await flushPromises()
    expect(d.editingNoteId.value).toBe('n1')
  })

  it('cancelEdit clears state', () => {
    const d = setup()
    d.openEdit({ id: 'n1', body: 'hello' })
    d.cancelEdit()
    expect(d.editingNoteId.value).toBe(null)
    expect(d.editBody.value).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/features/issues/composables/useIssueDiscussion.test.ts`
Expected: FAIL — `d.openEdit is not a function`.

- [ ] **Step 3: Implement edit state**

In `src/features/issues/composables/useIssueDiscussion.ts`, change the import on line 2 and add edit state alongside reply state. Add `useUpdateNote` to the import:

```ts
import { useAddNote, useUpdateNote } from '@/features/issues/composables/useIssueMutations'
```

Then, after the reply block (after `submitReply`, before the `return`), add:

```ts
  // Inline edit-in-place for the user's own notes. One note editable at a time;
  // the mutation invalidates the issue query so the edited body refreshes.
  const editMut = useUpdateNote(opts.fullPath, opts.iid)
  const editingNoteId = ref<string | null>(null)
  const editBody = ref('')
  const editPending = computed(() => editMut.isPending.value)
  const editError = computed(() => editMut.error.value)

  function openEdit(note: { id: string; body: string }) {
    editingNoteId.value = note.id
    editBody.value = note.body
    editMut.reset()
  }
  function cancelEdit() {
    editingNoteId.value = null
    editBody.value = ''
  }
  async function submitEdit(noteId: string) {
    const body = editBody.value.trim()
    if (!body || editMut.isPending.value) return
    try {
      await editMut.mutateAsync({ id: noteId, body })
      cancelEdit()
    } catch {
      // Left open with text intact; the error surfaces via editError below.
    }
  }
```

And extend the returned object to include the new members:

```ts
  return {
    fresh,
    replyingTo,
    replyBody,
    replyPending,
    replyError,
    openReply,
    cancelReply,
    submitReply,
    editingNoteId,
    editBody,
    editPending,
    editError,
    openEdit,
    cancelEdit,
    submitEdit,
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `bunx vitest run src/features/issues/composables/useIssueDiscussion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/composables/useIssueDiscussion.ts src/features/issues/composables/useIssueDiscussion.test.ts
git commit -m "feat(issues): edit state in useIssueDiscussion"
```

---

### Task 4: Inline edit UI in `IssueDiscussion.vue`

**Files:**
- Modify: `src/features/issues/components/IssueDiscussion.vue`
- Test (create): `src/features/issues/components/IssueDiscussion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/issues/components/IssueDiscussion.test.ts`. Mock `useIssueDiscussion` (so edit handlers are spies), `useCurrentUser`, `MarkdownText`, and `MentionTextarea`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const disc = vi.hoisted(() => ({
  fresh: { value: new Set<string>() },
  replyingTo: { value: null as string | null },
  replyBody: { value: '' },
  replyPending: { value: false },
  replyError: { value: null as unknown },
  openReply: vi.fn(),
  cancelReply: vi.fn(),
  submitReply: vi.fn(),
  editingNoteId: { value: null as string | null },
  editBody: { value: '' },
  editPending: { value: false },
  editError: { value: null as unknown },
  openEdit: vi.fn(),
  cancelEdit: vi.fn(),
  submitEdit: vi.fn(),
}))
vi.mock('@/features/issues/composables/useIssueDiscussion', () => ({
  useIssueDiscussion: () => disc,
}))
const currentUsername = vi.hoisted(() => ({ value: 'ada' as string | null }))
vi.mock('@/features/dashboard/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: currentUsername }),
}))
vi.mock('@/shared/components/MarkdownText.vue', () => ({
  default: { props: ['source'], template: '<span class="md">{{ source }}</span>' },
}))
vi.mock('@/features/issues/components/MentionTextarea.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}))

import IssueDiscussion from './IssueDiscussion.vue'

const threads = [
  {
    id: 'd1',
    notes: [{ id: 'n1', body: 'mine', createdAt: 't', author: { username: 'ada' } }],
  },
  {
    id: 'd2',
    notes: [{ id: 'n2', body: 'theirs', createdAt: 't', author: { username: 'lin' } }],
  },
]

function mountDiscussion() {
  return mount(IssueDiscussion, {
    props: {
      threads,
      notes: [{ id: 'n1' }, { id: 'n2' }],
      iid: '7',
      issue: { id: 'gid://Issue/1' },
      fullPath: 'grp/proj',
      members: [],
      comment: '',
    },
  })
}

beforeEach(() => {
  disc.openEdit.mockReset()
  disc.submitEdit.mockReset()
  disc.editingNoteId.value = null
  disc.editBody.value = ''
  currentUsername.value = 'ada'
})

describe('IssueDiscussion edit', () => {
  it('shows an Edit control only on the current user\'s own notes', () => {
    const w = mountDiscussion()
    const editButtons = w.findAll('button').filter((b) => b.text() === 'Edit')
    expect(editButtons).toHaveLength(1)
  })

  it('openEdit fires with the note id and body when Edit is clicked', async () => {
    const w = mountDiscussion()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Edit')!
      .trigger('click')
    expect(disc.openEdit).toHaveBeenCalledWith({ id: 'n1', body: 'mine' })
  })

  it('renders the editor instead of the body for the editing note and saves', async () => {
    disc.editingNoteId.value = 'n1'
    disc.editBody.value = 'mine edited'
    const w = mountDiscussion()
    expect(w.find('textarea').exists()).toBe(true)
    await w
      .findAll('button')
      .find((b) => b.text() === 'Save')!
      .trigger('click')
    expect(disc.submitEdit).toHaveBeenCalledWith('n1')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/features/issues/components/IssueDiscussion.test.ts`
Expected: FAIL — no `Edit` button found.

- [ ] **Step 3: Implement the UI**

In `src/features/issues/components/IssueDiscussion.vue`:

(a) In `<script setup>`, import the current-user composable and destructure the new edit members. After the existing `import MentionTextarea ...` line (8) add:

```ts
import { useCurrentUser } from '@/features/dashboard/composables/useCurrentUser'
```

Extend the `useIssueDiscussion` destructure (lines 26-40) to also pull the edit members:

```ts
const {
  fresh,
  replyingTo,
  replyBody,
  replyPending,
  replyError,
  openReply,
  cancelReply,
  submitReply,
  editingNoteId,
  editBody,
  editPending,
  editError,
  openEdit,
  cancelEdit,
  submitEdit,
} = useIssueDiscussion({
  fullPath: props.fullPath,
  iid: props.iid,
  issue: computed(() => props.issue),
  notes: computed(() => props.notes),
})

const { data: currentUsername } = useCurrentUser()
function isOwn(note: Note) {
  return !!currentUsername.value && note.author?.username === currentUsername.value
}
```

(b) In the template, replace the note body block (lines 81-95, the `<div class="min-w-0 flex-1">…</div>`) with one that swaps to the editor when this note is being edited and shows an Edit control on own notes:

```html
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <span class="text-sm font-medium text-foreground">
                {{ nameOrUsername(n.author) }}
              </span>
              <span class="font-mono text-xs text-muted-foreground">
                {{ new Date(n.createdAt).toLocaleDateString() }}
              </span>
              <Button
                v-if="isOwn(n) && editingNoteId !== n.id"
                type="button"
                variant="ghost"
                size="sm"
                class="ml-auto h-6 px-2 text-xs text-muted-foreground opacity-0 transition group-hover/note:opacity-100"
                @click="openEdit({ id: n.id, body: n.body })"
              >
                Edit
              </Button>
            </div>
            <MarkdownText
              v-if="editingNoteId !== n.id"
              :source="n.body"
              :project-path="fullPath"
              class="mt-1 max-w-[68ch] text-sm leading-relaxed"
            />
            <div v-else class="mt-1 space-y-2">
              <MentionTextarea
                v-model="editBody"
                :members="members"
                :full-path="fullPath"
                :rows="3"
                placeholder="Edit your comment…"
                aria-label="Edit comment"
                @keydown.esc="cancelEdit"
                @open-change="mentionOpen = $event"
              />
              <ErrorNotice v-if="editError" :error="editError" />
              <div class="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  :disabled="editPending || !editBody.trim()"
                  @click="submitEdit(n.id)"
                >
                  {{ editPending ? 'Saving…' : 'Save' }}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="editPending"
                  @click="cancelEdit"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
```

(c) Add the `group/note` hover group to the per-note row so the Edit control reveals on hover. On line 75-77 the row `<div data-testid="note" class="flex gap-3" …>` — add `group/note` to its class list:

```html
          class="group/note flex gap-3"
```

- [ ] **Step 4: Run to verify pass**

Run: `bunx vitest run src/features/issues/components/IssueDiscussion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/issues/components/IssueDiscussion.vue src/features/issues/components/IssueDiscussion.test.ts
git commit -m "feat(issues): inline edit UI for own comments"
```

---

### Task 5: Inline edit UI in `MrDiscussion.vue`

**Files:**
- Modify: `src/features/merge_requests/components/MrDiscussion.vue`
- Test: `src/features/merge_requests/components/MrDiscussion.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/features/merge_requests/components/MrDiscussion.test.ts`, the existing mock of `@/features/merge_requests/composables/useMrDiscussion` only returns `useMrAddNote`. Extend it to also return a controllable `useMrUpdateNote`, mock `useCurrentUser`, and set the first note's author to the current user. Update the mock block and `threads`:

```ts
const editHandle = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: { value: false },
  error: { value: null as unknown },
}))
vi.mock('@/features/merge_requests/composables/useMrDiscussion', () => ({
  useMrAddNote: () => ({ mutateAsync, reset, isPending, error }),
  useMrUpdateNote: () => editHandle,
}))
const mrUsername = vi.hoisted(() => ({ value: 'ada' as string | null }))
vi.mock('@/features/dashboard/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: mrUsername }),
}))
```

(Note `threads[0].notes[0].author.username` is already `'ada'` and `threads[1]` is `'lin'`, matching the current-user gate.) Add `editHandle` resets to `beforeEach`:

```ts
  editHandle.mutateAsync.mockReset()
  editHandle.reset.mockReset()
  editHandle.isPending.value = false
  editHandle.error.value = null
  mrUsername.value = 'ada'
```

Then add the edit cases:

```ts
  it('shows an Edit control only on the current user\'s own notes', () => {
    const w = mountDiscussion()
    expect(w.findAll('button').filter((b) => b.text() === 'Edit')).toHaveLength(1)
  })

  it('edits an own note: opens the editor, saves id + body, closes on success', async () => {
    editHandle.mutateAsync.mockResolvedValue({ note: { id: 'n1', body: 'edited' } })
    const w = mountDiscussion()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Edit')!
      .trigger('click')
    await w.find('textarea').setValue('edited')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Save')!
      .trigger('click')
    await flushPromises()
    expect(editHandle.mutateAsync).toHaveBeenCalledWith({ id: 'n1', body: 'edited' })
    expect(w.findAll('button').some((b) => b.text() === 'Save')).toBe(false)
  })

  it('keeps the editor open and shows an error when the edit fails', async () => {
    editHandle.mutateAsync.mockRejectedValue({ kind: 'graphql', message: 'denied' })
    editHandle.error.value = { kind: 'graphql', message: 'denied' }
    const w = mountDiscussion()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Edit')!
      .trigger('click')
    await w.find('textarea').setValue('x')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Save')!
      .trigger('click')
    await flushPromises()
    expect(w.findAll('button').some((b) => b.text() === 'Save')).toBe(true)
    expect(w.text()).toContain('denied')
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/features/merge_requests/components/MrDiscussion.test.ts`
Expected: FAIL — no `Edit` button.

- [ ] **Step 3: Implement the UI**

Rewrite `src/features/merge_requests/components/MrDiscussion.vue` to add edit state and UI:

```html
<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import MarkdownText from '@/shared/components/MarkdownText.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import { useMrAddNote, useMrUpdateNote } from '@/features/merge_requests/composables/useMrDiscussion'
import { useCurrentUser } from '@/features/dashboard/composables/useCurrentUser'

type NoteAuthor = { name?: string | null; username: string } | null | undefined
type Note = { id: string; body: string; system: boolean; createdAt: string; author?: NoteAuthor }
type Thread = { id: string; notes: Note[] }

const props = defineProps<{
  threads: Thread[]
  fullPath: string
  iid: string
  mrId: string
}>()

const reply = useMrAddNote(props.fullPath, props.iid)
const replyingTo = ref<string | null>(null)
const body = ref('')

function open(threadId: string) {
  replyingTo.value = threadId
  body.value = ''
  reply.reset()
}
function cancel() {
  replyingTo.value = null
  body.value = ''
}
async function submit(threadId: string) {
  const text = body.value.trim()
  if (!text || reply.isPending.value) return
  try {
    await reply.mutateAsync({ noteableId: props.mrId, discussionId: threadId, body: text })
    cancel()
  } catch {
    /* error surfaces below; keep the box open */
  }
}

// Inline edit-in-place for the current user's own notes.
const editMut = useMrUpdateNote(props.fullPath, props.iid)
const editingNoteId = ref<string | null>(null)
const editBody = ref('')
const { data: currentUsername } = useCurrentUser()
function isOwn(note: Note) {
  return !!currentUsername.value && note.author?.username === currentUsername.value
}
function openEdit(note: Note) {
  editingNoteId.value = note.id
  editBody.value = note.body
  editMut.reset()
}
function cancelEdit() {
  editingNoteId.value = null
  editBody.value = ''
}
async function submitEdit(noteId: string) {
  const text = editBody.value.trim()
  if (!text || editMut.isPending.value) return
  try {
    await editMut.mutateAsync({ id: noteId, body: text })
    cancelEdit()
  } catch {
    /* error surfaces below; keep the editor open */
  }
}

const nameOf = (a: NoteAuthor) => a?.name || a?.username || 'unknown'
</script>

<template>
  <div class="space-y-6">
    <div v-for="thread in threads" :key="thread.id" class="rounded-lg border border-border/60 p-3">
      <div v-for="note in thread.notes" :key="note.id" class="group/note mb-3 last:mb-0">
        <div class="flex items-baseline gap-2">
          <p class="text-xs text-muted-foreground">{{ nameOf(note.author) }}</p>
          <Button
            v-if="isOwn(note) && editingNoteId !== note.id"
            size="sm"
            variant="ghost"
            class="ml-auto h-6 px-2 text-xs opacity-0 transition group-hover/note:opacity-100"
            @click="openEdit(note)"
          >
            Edit
          </Button>
        </div>
        <MarkdownText v-if="editingNoteId !== note.id" :source="note.body" class="prose-sm" />
        <div v-else class="mt-1 space-y-2">
          <Textarea v-model="editBody" rows="3" aria-label="Edit comment" />
          <ErrorNotice v-if="editMut.error.value" :error="editMut.error.value" />
          <div class="flex gap-2">
            <Button
              size="sm"
              :disabled="editMut.isPending.value || !editBody.trim()"
              @click="submitEdit(note.id)"
            >
              {{ editMut.isPending.value ? 'Saving…' : 'Save' }}
            </Button>
            <Button size="sm" variant="ghost" @click="cancelEdit">Cancel</Button>
          </div>
        </div>
      </div>

      <div v-if="replyingTo === thread.id" class="mt-2 space-y-2">
        <Textarea v-model="body" rows="3" placeholder="Reply…" aria-label="Reply" />
        <ErrorNotice v-if="reply.error.value" :error="reply.error.value" />
        <div class="flex gap-2">
          <Button size="sm" :disabled="reply.isPending.value" @click="submit(thread.id)">
            {{ reply.isPending.value ? 'Posting…' : 'Reply' }}
          </Button>
          <Button size="sm" variant="ghost" @click="cancel">Cancel</Button>
        </div>
      </div>
      <Button v-else size="sm" variant="ghost" class="mt-1" @click="open(thread.id)">Reply</Button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run to verify pass**

Run: `bunx vitest run src/features/merge_requests/components/MrDiscussion.test.ts`
Expected: PASS (existing reply cases still green — the per-thread `.rounded-lg` "one reply box" test is unaffected because edit uses a separate `editingNoteId`).

- [ ] **Step 5: Commit**

```bash
git add src/features/merge_requests/components/MrDiscussion.vue src/features/merge_requests/components/MrDiscussion.test.ts
git commit -m "feat(mr): inline edit UI for own comments"
```

---

### Task 6: MCP — note ids + `lumen_issue_comment_edit`

**Files:**
- Modify: `src/bun/mcp/gitlab/issues.ts`
- Test: `src/bun/mcp/gitlab/issues.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/bun/mcp/gitlab/issues.test.ts` (it mocks `./client`'s `gql` as `c.gql` and `../app/bridge`'s `emitInvalidate`). The edit handler calls `gql` in order: current user, issue discussions, then `updateNote`. Drive that with `mockResolvedValueOnce`.

```ts
describe('lumen_issue_comment_edit', () => {
  const issueWithNote = (noteAuthor: string) => ({
    project: {
      issue: {
        discussions: {
          nodes: [
            { notes: { nodes: [{ id: 'gid://Note/1', author: { username: noteAuthor } }] } },
          ],
        },
      },
    },
  })

  it('edits the comment when the current user is its author', async () => {
    c.gql
      .mockResolvedValueOnce({ currentUser: { username: 'me' } })
      .mockResolvedValueOnce(issueWithNote('me'))
      .mockResolvedValueOnce({ updateNote: { note: { id: 'gid://Note/1' }, errors: [] } })
    const res = await tool('lumen_issue_comment_edit').handler({
      project: 'g/p',
      iid: '7',
      noteId: 'gid://Note/1',
      body: 'edited',
    })
    expect(c.gql).toHaveBeenLastCalledWith(
      expect.stringContaining('updateNote'),
      { input: { id: 'gid://Note/1', body: 'edited' } },
    )
    expect(emitInvalidate).toHaveBeenCalledWith({ resource: 'issue', project: 'g/p', iid: '7' })
    expect(bodyText(res)).toContain('updated')
  })

  it('refuses to edit a comment authored by someone else', async () => {
    c.gql
      .mockResolvedValueOnce({ currentUser: { username: 'me' } })
      .mockResolvedValueOnce(issueWithNote('other'))
    const res = await tool('lumen_issue_comment_edit').handler({
      project: 'g/p',
      iid: '7',
      noteId: 'gid://Note/1',
      body: 'edited',
    })
    expect(res.isError).toBe(true)
    expect(bodyText(res)).toContain('your own')
    expect(emitInvalidate).not.toHaveBeenCalled()
    // No updateNote call — only currentUser + issue fetch.
    expect(c.gql).toHaveBeenCalledTimes(2)
  })

  it('errors when the note id is not on the issue', async () => {
    c.gql
      .mockResolvedValueOnce({ currentUser: { username: 'me' } })
      .mockResolvedValueOnce(issueWithNote('me'))
    const res = await tool('lumen_issue_comment_edit').handler({
      project: 'g/p',
      iid: '7',
      noteId: 'gid://Note/999',
      body: 'edited',
    })
    expect(res.isError).toBe(true)
    expect(bodyText(res)).toContain('not found')
  })
})
```

(If `res.isError` isn't how `errorResult` marks failures in this codebase, assert via `bodyText(res)` content only — check `src/bun/mcp/types.ts` for the shape and adjust. `errorResult` returns `{ content: [...], isError: true }` per the MCP spec.)

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/bun/mcp/gitlab/issues.test.ts`
Expected: FAIL — `tool('lumen_issue_comment_edit')` is undefined (`.handler` on undefined).

- [ ] **Step 3: Implement**

In `src/bun/mcp/gitlab/issues.ts`:

(a) Add note `id` to `GET_Q` so the read tool surfaces ids (line 18):

```ts
    discussions{nodes{notes{nodes{id body author{username} createdAt}}}} } } }`
```

(b) Add two query/mutation consts near the others (after line 39):

```ts
const CURRENT_USER_Q = `{currentUser{username}}`
const UPDATE_NOTE_M = `mutation($input:UpdateNoteInput!){updateNote(input:$input){note{id} errors}}`
```

(c) Add the tool to `issueTools` (after `lumen_issue_comment`, before the closing `]`):

```ts
  {
    name: 'lumen_issue_comment_edit',
    description:
      "Edit one of your own comments on an issue. Pass the note id from lumen_issue_get. Refuses to edit comments authored by anyone else.",
    inputSchema: {
      project: z.string(),
      iid: z.string().regex(/^\d+$/, 'iid must be numeric'),
      noteId: z.string().describe('The note global id (gid://...) from lumen_issue_get.'),
      body: z.string(),
    },
    handler: async (a) => {
      const me = await gql<{ currentUser: { username: string } | null }>(CURRENT_USER_Q, {})
      const myUsername = me.currentUser?.username
      if (!myUsername) return errorResult('Could not resolve the current user.')

      const data = await gql<{
        project: {
          issue: {
            discussions: { nodes: { notes: { nodes: { id: string; author: { username: string } | null }[] } }[] }
          } | null
        } | null
      }>(GET_Q, { p: a.project, iid: a.iid })
      const notes =
        data.project?.issue?.discussions.nodes.flatMap((d) => d.notes.nodes) ?? []
      const note = notes.find((n) => n.id === a.noteId)
      if (!note) return errorResult(`Comment ${a.noteId} not found on ${a.project}#${a.iid}.`)
      if (note.author?.username !== myUsername)
        return errorResult('You can only edit your own comments.')

      const res = await gql<{ updateNote: { note: { id: string } | null; errors: string[] } }>(
        UPDATE_NOTE_M,
        { input: { id: a.noteId, body: a.body } },
      )
      if (res.updateNote.errors.length) return errorResult(res.updateNote.errors.join('; '))
      emitInvalidate({ resource: 'issue', project: a.project as string, iid: a.iid as string })
      return text(`Comment ${a.noteId} on ${a.project}#${a.iid} updated.`)
    },
  },
```

- [ ] **Step 4: Run to verify pass**

Run: `bunx vitest run src/bun/mcp/gitlab/issues.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bun/mcp/gitlab/issues.ts src/bun/mcp/gitlab/issues.test.ts
git commit -m "feat(mcp): lumen_issue_comment_edit (own-only) + note ids in issue_get"
```

---

### Task 7: MCP — note ids + `lumen_mr_comment_edit`

**Files:**
- Modify: `src/bun/mcp/gitlab/mergeRequests.ts`
- Test: `src/bun/mcp/gitlab/mergeRequests.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/bun/mcp/gitlab/mergeRequests.test.ts`, mirroring Task 6 but navigating `project.mergeRequest`. Match that test file's existing mock setup for `./client`'s `gql` and `../app/bridge`'s `emitInvalidate` (check the top of the file and reuse the same handles/`bodyText` helper).

```ts
describe('lumen_mr_comment_edit', () => {
  const mrWithNote = (noteAuthor: string) => ({
    project: {
      mergeRequest: {
        discussions: {
          nodes: [
            { notes: { nodes: [{ id: 'gid://Note/1', author: { username: noteAuthor } }] } },
          ],
        },
      },
    },
  })

  it('edits the comment when the current user is its author', async () => {
    gql
      .mockResolvedValueOnce({ currentUser: { username: 'me' } })
      .mockResolvedValueOnce(mrWithNote('me'))
      .mockResolvedValueOnce({ updateNote: { note: { id: 'gid://Note/1' }, errors: [] } })
    const res = await tool('lumen_mr_comment_edit').handler({
      project: 'g/p',
      iid: '5',
      noteId: 'gid://Note/1',
      body: 'edited',
    })
    expect(gql).toHaveBeenLastCalledWith(
      expect.stringContaining('updateNote'),
      { input: { id: 'gid://Note/1', body: 'edited' } },
    )
    expect(emitInvalidate).toHaveBeenCalledWith({
      resource: 'merge_request',
      project: 'g/p',
      iid: '5',
    })
    expect(bodyText(res)).toContain('updated')
  })

  it('refuses to edit a comment authored by someone else', async () => {
    gql
      .mockResolvedValueOnce({ currentUser: { username: 'me' } })
      .mockResolvedValueOnce(mrWithNote('other'))
    const res = await tool('lumen_mr_comment_edit').handler({
      project: 'g/p',
      iid: '5',
      noteId: 'gid://Note/1',
      body: 'edited',
    })
    expect(res.isError).toBe(true)
    expect(bodyText(res)).toContain('your own')
    expect(gql).toHaveBeenCalledTimes(2)
  })
})
```

> **Important:** confirm the exact `emitInvalidate` resource string the MR write tools use elsewhere in this file. The issue tools use `resource: 'issue'`. Check what an MR invalidation uses across the MCP/bridge code — search `resource: 'merge_request'` vs `'mr'` in `src/bun/mcp` and match it in both the test and the handler below. If MR write tools don't currently emit invalidate at all, search `bridge.ts` for the accepted resource union and use the MR member it defines.

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/bun/mcp/gitlab/mergeRequests.test.ts`
Expected: FAIL — tool undefined.

- [ ] **Step 3: Implement**

In `src/bun/mcp/gitlab/mergeRequests.ts`:

(a) Add note `id` to `GET_Q` (line 17):

```ts
    discussions{nodes{notes{nodes{id body author{username} createdAt}}}} } } }`
```

(b) Add consts after line 20 (and import `emitInvalidate` if not already imported — check the top of the file; if absent add `import { emitInvalidate } from '../app/bridge'`):

```ts
const CURRENT_USER_Q = `{currentUser{username}}`
const UPDATE_NOTE_M = `mutation($input:UpdateNoteInput!){updateNote(input:$input){note{id} errors}}`
```

(c) Add the tool to `mrTools` (after `lumen_mr_comment`):

```ts
  {
    name: 'lumen_mr_comment_edit',
    description:
      "Edit one of your own comments on a merge request. Pass the note id from lumen_mr_get. Refuses to edit comments authored by anyone else.",
    inputSchema: {
      project: z.string(),
      iid: z.string().regex(/^\d+$/, 'iid must be numeric'),
      noteId: z.string().describe('The note global id (gid://...) from lumen_mr_get.'),
      body: z.string(),
    },
    handler: async (a) => {
      const me = await gql<{ currentUser: { username: string } | null }>(CURRENT_USER_Q, {})
      const myUsername = me.currentUser?.username
      if (!myUsername) return errorResult('Could not resolve the current user.')

      const data = await gql<{
        project: {
          mergeRequest: {
            discussions: { nodes: { notes: { nodes: { id: string; author: { username: string } | null }[] } }[] }
          } | null
        } | null
      }>(GET_Q, { p: a.project, iid: a.iid })
      const notes =
        data.project?.mergeRequest?.discussions.nodes.flatMap((d) => d.notes.nodes) ?? []
      const note = notes.find((n) => n.id === a.noteId)
      if (!note) return errorResult(`Comment ${a.noteId} not found on ${a.project}!${a.iid}.`)
      if (note.author?.username !== myUsername)
        return errorResult('You can only edit your own comments.')

      const res = await gql<{ updateNote: { note: { id: string } | null; errors: string[] } }>(
        UPDATE_NOTE_M,
        { input: { id: a.noteId, body: a.body } },
      )
      if (res.updateNote.errors.length) return errorResult(res.updateNote.errors.join('; '))
      emitInvalidate({ resource: 'merge_request', project: a.project as string, iid: a.iid as string })
      return text(`Comment ${a.noteId} on ${a.project}!${a.iid} updated.`)
    },
  },
```

(Adjust the `emitInvalidate` resource string per the Step 1 note.)

- [ ] **Step 4: Run to verify pass**

Run: `bunx vitest run src/bun/mcp/gitlab/mergeRequests.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bun/mcp/gitlab/mergeRequests.ts src/bun/mcp/gitlab/mergeRequests.test.ts
git commit -m "feat(mcp): lumen_mr_comment_edit (own-only) + note ids in mr_get"
```

---

### Task 8: Docs sync + full verification

**Files:**
- Modify: MCP docs/spec listings that enumerate tools (search for them).

- [ ] **Step 1: Update tool documentation**

Search for where MCP tools are documented and add the two new tools:

Run: `grep -rln "lumen_issue_comment\|lumen_mr_comment" docs src README.md 2>/dev/null`

For each doc hit (e.g. the MCP spec `docs/superpowers/specs/2026-06-09-mcp-server-design.md` tool count/list, or any README MCP section), add `lumen_issue_comment_edit` and `lumen_mr_comment_edit` and bump any stated tool count (the memory notes "20 tools"; it becomes 22). Show the actual edited lines when doing this — do not leave it vague.

- [ ] **Step 2: Format**

Run: `bun run format`
Expected: clean, files reformatted in place.

- [ ] **Step 3: Run the full suite**

Run: `bunx vitest run`
Expected: PASS — no regressions across the suite.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs(mcp): document comment-edit tools; format"
```

---

## Self-Review

**Spec coverage:**
- Markdown already supported → reframe captured; no task needed (correct).
- Identity / own-only predicate → Tasks 4, 5 (`isOwn` via `useCurrentUser`), Tasks 6, 7 (server-side author check).
- Mutation composables (`useUpdateNote`, `useMrUpdateNote`) → Tasks 1, 2.
- Inline edit UI (issues + MRs) → Tasks 4, 5.
- MCP note ids in read output → Tasks 6, 7 (Step 3a).
- MCP edit tools, own-only enforced → Tasks 6, 7.
- Error handling (empty body blocked, errors[] surfaced, foreign-author refused) → covered in composable/component/MCP tests.
- Testing across composables/UI/MCP → every task is TDD.

**Placeholder scan:** No TBD/TODO; every code step has complete code. Two explicit "confirm X in the codebase" notes (MCP `isError` shape; MR invalidate resource string) are verification instructions with concrete fallbacks, not placeholders.

**Type consistency:** `openEdit({ id, body })`, `submitEdit(noteId)`, `editingNoteId`, `editBody`, `editPending`, `editError`, `cancelEdit` are named identically across the composable (Task 3), the issue UI (Task 4), and mirrored locally in the MR component (Task 5). Mutation input `{ id, body }` matches across composables and MCP `UPDATE_NOTE_M`. Query keys (`['issue', fullPath, iid]`, `mrKey`) match the existing code.

## Out of Scope (per spec)
Editing others' comments / maintainer `adminNote` edits, deleting comments, edit-history indicator, any markdown-rendering change.
