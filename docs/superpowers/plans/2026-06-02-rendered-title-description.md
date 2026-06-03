# Rendered Title & Description with Edit/Preview Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the issue title and description start rendered (heading / markdown) with a per-field Edit/Preview toggle, on top of the existing buffered Save/Cancel model.

**Architecture:** A small reusable `EditableField.vue` owns the rendered/edit toggle (`v-model:editing` + `view`/`edit` slots + a toggle button). `IssueDetail.vue` uses one per field, defaulting to rendered, reading rendered content from the draft, and collapsing back to rendered after a successful Save.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, lucide, Tailwind v4, Vitest + `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-06-02-rendered-title-description-design.md`

**Conventions:**
- Run one test file: `bunx vitest run <path>`
- Full suite: `bun run test -- --run`
- Typecheck: `bun run typecheck`
- Commit trailer (every commit): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Create:**
- `src/components/EditableField.vue` — rendered/edit toggle wrapper (view/edit slots)
- `src/components/EditableField.test.ts`

**Modify:**
- `src/views/IssueDetail.vue` — wrap title + description in `EditableField`; Save/Cancel return to rendered
- `src/views/IssueDetail.test.ts` — default-rendered assertions + toggle reveals editors

---

## Task 1: `EditableField.vue` — rendered/edit toggle wrapper

**Files:**
- Create: `src/components/EditableField.vue`
- Test: `src/components/EditableField.test.ts`

- [ ] **Step 1: Write the failing test** — `src/components/EditableField.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EditableField from "./EditableField.vue";

const mountField = (editing = false) =>
  mount(EditableField, {
    props: { editing, label: "Title" },
    slots: {
      view: "<div data-testid='v'>VIEW</div>",
      edit: "<div data-testid='e'>EDIT</div>",
    },
  });

describe("EditableField", () => {
  it("shows the view slot and hides edit when not editing", () => {
    const w = mountField(false);
    expect(w.find('[data-testid="v"]').exists()).toBe(true);
    expect(w.find('[data-testid="e"]').exists()).toBe(false);
  });

  it("shows the edit slot and hides view when editing", () => {
    const w = mountField(true);
    expect(w.find('[data-testid="e"]').exists()).toBe(true);
    expect(w.find('[data-testid="v"]').exists()).toBe(false);
  });

  it("toggle emits update:editing with the flipped value", async () => {
    const w = mountField(false);
    await w.get('[data-testid="editable-toggle"]').trigger("click");
    expect(w.emitted("update:editing")?.at(-1)).toEqual([true]);
  });

  it("toggle reads Edit when rendered and Preview when editing", () => {
    expect(mountField(false).get('[data-testid="editable-toggle"]').text()).toContain("Edit");
    expect(mountField(true).get('[data-testid="editable-toggle"]').text()).toContain("Preview");
  });

  it("honors a custom toggle testid", async () => {
    const w = mount(EditableField, {
      props: { editing: false, label: "Title", toggleTestid: "x-toggle" },
      slots: { view: "<i>v</i>", edit: "<i>e</i>" },
    });
    await w.get('[data-testid="x-toggle"]').trigger("click");
    expect(w.emitted("update:editing")?.at(-1)).toEqual([true]);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/components/EditableField.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement** — `src/components/EditableField.vue`:

```vue
<script setup lang="ts">
import { Eye, Pencil } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    editing: boolean;
    label: string;
    toggleTestid?: string;
  }>(),
  { toggleTestid: "editable-toggle" },
);
const emit = defineEmits<{ "update:editing": [value: boolean] }>();
</script>

<template>
  <div
    class="space-y-1.5"
    @keydown.escape="props.editing && emit('update:editing', false)"
  >
    <div class="flex items-center justify-end">
      <button
        type="button"
        :data-testid="props.toggleTestid"
        :aria-label="(props.editing ? 'Preview ' : 'Edit ') + props.label"
        class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        @click="emit('update:editing', !props.editing)"
      >
        <component :is="props.editing ? Eye : Pencil" class="size-3.5" />
        {{ props.editing ? "Preview" : "Edit" }}
      </button>
    </div>
    <slot v-if="props.editing" name="edit" />
    <slot v-else name="view" />
  </div>
</template>
```

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/components/EditableField.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/EditableField.vue src/components/EditableField.test.ts
git commit -m "feat(ui): EditableField rendered/edit toggle wrapper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire title + description through `EditableField`

**Files:**
- Modify: `src/views/IssueDetail.vue`
- Test: `src/views/IssueDetail.test.ts`

- [ ] **Step 1: Update the test** — `src/views/IssueDetail.test.ts`:

(a) Replace the first test ("renders the editable title and description bound to the draft") with these THREE cases (default-rendered + toggle reveals editors). Insert them in place of that one test, keeping the rest of the file:

```ts
  it("renders title and description (no editors) by default", async () => {
    const w = mountDetail();
    await flushPromises();
    expect(w.text()).toContain("Bug");
    expect(w.text()).toContain("the description");
    expect(w.text()).toContain("me too");
    expect(w.find('[data-testid="edit-title"]').exists()).toBe(false);
    expect(w.find('textarea[aria-label="Issue description"]').exists()).toBe(false);
  });

  it("reveals the title input when its Edit toggle is clicked", async () => {
    const w = mountDetail();
    await flushPromises();
    await w.get('[data-testid="edit-title-toggle"]').trigger("click");
    expect(
      (w.find('[data-testid="edit-title"]').element as HTMLInputElement).value,
    ).toBe("Bug");
  });

  it("reveals the description textarea when its Edit toggle is clicked", async () => {
    const w = mountDetail();
    await flushPromises();
    await w.get('[data-testid="edit-description-toggle"]').trigger("click");
    expect(
      w.find('textarea[aria-label="Issue description"]').exists(),
    ).toBe(true);
  });

  it("returns fields to rendered after a successful save", async () => {
    draftState.dirty!.value = true;
    draftSave.mockImplementation(() => {
      draftState.dirty!.value = false;
    });
    const w = mountDetail();
    await flushPromises();
    await w.get('[data-testid="edit-title-toggle"]').trigger("click");
    expect(w.find('[data-testid="edit-title"]').exists()).toBe(true);
    await w.get('[data-testid="save-issue"]').trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="edit-title"]').exists()).toBe(false);
  });
```

(b) The existing "Save calls draft.save and Cancel calls draft.reset" test still works as-is (Save → `onSave` → `draftSave`; Cancel → `onCancel` → `draftReset`). Leave it unchanged. Leave the system-notes, footer-visibility, comment-binding, no-Comment-button, and toggle-state tests unchanged.

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/views/IssueDetail.test.ts`
Expected: FAIL — `edit-title-toggle` absent; title renders as input not heading.

- [ ] **Step 3: Edit `src/views/IssueDetail.vue`**

1. Add `ref` to the vue import and import `EditableField`:
```ts
import { computed, ref, toRef, watch } from "vue";
```
```ts
import EditableField from "@/components/EditableField.vue";
```
(Place the `EditableField` import alongside the other component imports.)

2. Add the per-field view-mode refs and the Save/Cancel wrappers. Insert after the `toggleState` function (around line 94):
```ts
const editingTitle = ref(false);
const editingDescription = ref(false);

// After a successful save (buffer cleared) collapse edited fields back to their
// rendered view; if the save failed (still dirty), stay in edit mode so unsaved
// changes are not hidden.
async function onSave() {
  await save();
  if (!dirty.value) {
    editingTitle.value = false;
    editingDescription.value = false;
  }
}
// Cancel discards the buffer and returns both fields to rendered.
function onCancel() {
  reset();
  editingTitle.value = false;
  editingDescription.value = false;
}
```

3. Replace the title `<Input ...>` block (current lines 132-137) with:
```vue
    <EditableField
      v-model:editing="editingTitle"
      label="Title"
      toggle-testid="edit-title-toggle"
    >
      <template #view>
        <h1 class="text-lg font-semibold text-foreground">{{ draft.title }}</h1>
      </template>
      <template #edit>
        <Input
          v-model="draft.title"
          data-testid="edit-title"
          aria-label="Issue title"
          class="text-lg font-semibold"
        />
      </template>
    </EditableField>
```

4. Replace the description `<Textarea ...>` block (current lines 149-154) with:
```vue
    <EditableField
      v-model:editing="editingDescription"
      label="Description"
      toggle-testid="edit-description-toggle"
    >
      <template #view>
        <MarkdownText
          v-if="draft.description.trim()"
          :source="draft.description"
          :project-path="fullPath"
          class="text-sm"
        />
        <p v-else class="text-sm text-muted-foreground">No description</p>
      </template>
      <template #edit>
        <Textarea
          v-model="draft.description"
          :rows="6"
          aria-label="Issue description"
          placeholder="Add a description…"
        />
      </template>
    </EditableField>
```

5. In the sticky footer, point the buttons at the wrappers: change the Cancel button's `@click="reset"` to `@click="onCancel"`, and the Save button's `@click="save"` to `@click="onSave"`. (Leave `:disabled="saving"` and the labels unchanged.)

- [ ] **Step 4: Run, verify pass + typecheck**

Run: `bunx vitest run src/views/IssueDetail.test.ts && bun run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/IssueDetail.vue src/views/IssueDetail.test.ts
git commit -m "feat(issue): rendered title/description with per-field edit toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Verification + targeted format

- [ ] **Step 1: Full suite** — Run: `bun run test -- --run` — Expected: all green.
- [ ] **Step 2: Typecheck** — Run: `bun run typecheck` — Expected: clean (exit 0).
- [ ] **Step 3: Format only the touched files** (do NOT run `bun run format` — it reformats the whole repo, which isn't prettier-clean):

```bash
bunx prettier --write --experimental-cli \
  src/components/EditableField.vue src/components/EditableField.test.ts \
  src/views/IssueDetail.vue src/views/IssueDetail.test.ts
```

- [ ] **Step 4: Re-run suite + typecheck after format** — `bun run test -- --run && bun run typecheck` — Expected: green.
- [ ] **Step 5: Manual smoke (user, against live instance)** — `bun dev`, then:
  - Open an issue: title shows as a heading, description as rendered markdown, each with an Edit button.
  - Click Edit on the title → input; type → Save returns it to the rendered heading. Same for description (Preview shows the in-progress markdown).
  - Empty description shows "No description" with an Edit button.
  - A failed save (e.g. offline) keeps the field in edit mode.
- [ ] **Step 6: Commit any format changes**

```bash
git add -A
git commit -m "chore: format rendered title/description work

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes (planner)

- **Spec coverage:** EditableField (toggle, view/edit slots, Esc-to-view) → Task 1. Per-field wiring, plain-heading title, markdown/`No description` view, default rendered, return-to-rendered on successful save, Cancel-to-rendered, button-only affordance → Task 2. Verification/format → Task 3.
- **Type/name consistency:** `EditableField` props `editing`/`label`/`toggleTestid`, emit `update:editing`; IssueDetail refs `editingTitle`/`editingDescription`, wrappers `onSave`/`onCancel`; testids `edit-title-toggle`/`edit-description-toggle` (parent) and default `editable-toggle` (component) — consistent across tasks.
- **Save-failure path:** `onSave` only collapses when `!dirty.value`; tested via a mock that clears dirty (success) — the unchanged "Save calls draft.save" test exercises the no-collapse path implicitly (mock leaves dirty true).
- **No server/GraphQL impact;** draft/dirty/guard model untouched.
