# Scratchpad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-local, per-issue free-form note area ("Scratchpad") that auto-saves to `localStorage` and never reaches GitLab.

**Architecture:** A `useScratchpad` composable wraps `@vueuse/core`'s `useLocalStorage` with a reactive getter key (`lumen:scratchpad:${fullPath}#${iid}`) so it re-keys when the viewed issue changes. It only creates storage when content exists and removes the entry when cleared. A self-contained `Scratchpad.vue` binds a `Textarea` to that ref and flashes a debounced "Saved" hint. `IssueDetail.vue` renders the component below the GitLab Notes section; because `IssueDrawer` embeds `IssueDetail`, the drawer gets it for free.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, `@vueuse/core` (`useLocalStorage`, `useDebounceFn`), Vitest + `@vue/test-utils`, existing `Textarea` ui component.

---

## File Structure

- Create: `src/composables/useScratchpad.ts` — reactive localStorage-backed string ref keyed by issue.
- Create: `src/composables/useScratchpad.test.ts` — unit tests for storage read/write/isolation.
- Create: `src/components/Scratchpad.vue` — textarea bound to the composable + "Saved" indicator.
- Create: `src/components/Scratchpad.test.ts` — component tests.
- Modify: `src/views/IssueDetail.vue` — import and render `<Scratchpad>` in a new section.

---

## Task 1: `useScratchpad` composable

**Files:**

- Create: `src/composables/useScratchpad.ts`
- Test: `src/composables/useScratchpad.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/composables/useScratchpad.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { ref, nextTick } from "vue";
import { useScratchpad } from "./useScratchpad";

beforeEach(() => {
  localStorage.clear();
});

describe("useScratchpad", () => {
  it("reads an existing localStorage value on init", () => {
    localStorage.setItem(
      "lumen:scratchpad:grp/proj#9",
      JSON.stringify("hello"),
    );
    const note = useScratchpad(ref("grp/proj"), ref("9"));
    expect(note.value).toBe("hello");
  });

  it("defaults to an empty string when nothing is stored", () => {
    const note = useScratchpad(ref("grp/proj"), ref("9"));
    expect(note.value).toBe("");
  });

  it("persists writes to localStorage under the issue key", async () => {
    const note = useScratchpad(ref("grp/proj"), ref("9"));
    note.value = "remember this";
    await nextTick();
    expect(localStorage.getItem("lumen:scratchpad:grp/proj#9")).toBe(
      JSON.stringify("remember this"),
    );
  });

  it("does not collide across different iids", async () => {
    const iid = ref("9");
    const note = useScratchpad(ref("grp/proj"), iid);
    note.value = "note for nine";
    await nextTick();

    iid.value = "10";
    await nextTick();
    expect(note.value).toBe("");

    note.value = "note for ten";
    await nextTick();
    expect(localStorage.getItem("lumen:scratchpad:grp/proj#9")).toBe(
      JSON.stringify("note for nine"),
    );
    expect(localStorage.getItem("lumen:scratchpad:grp/proj#10")).toBe(
      JSON.stringify("note for ten"),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- --run src/composables/useScratchpad.test.ts`
Expected: FAIL — cannot resolve `./useScratchpad` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/composables/useScratchpad.ts`:

```ts
import { useLocalStorage, type RemovableRef } from "@vueuse/core";
import type { Ref } from "vue";

// Local-only note for a single issue, stored in this browser only — never sent
// to GitLab. Keyed by fullPath + iid to mirror `issueKey` and stay isolated
// per issue. The key is a getter so the ref re-keys when the viewed issue
// changes (navigation, or the drawer's `:key="iid"` remount).
export function useScratchpad(
  fullPath: Ref<string>,
  iid: Ref<string>,
): RemovableRef<string> {
  return useLocalStorage(
    () => `lumen:scratchpad:${fullPath.value}#${iid.value}`,
    "",
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- --run src/composables/useScratchpad.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useScratchpad.ts src/composables/useScratchpad.test.ts
git commit -m "feat: add useScratchpad composable for local-only issue notes"
```

---

## Task 2: `Scratchpad.vue` component

**Files:**

- Create: `src/components/Scratchpad.vue`
- Test: `src/components/Scratchpad.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/Scratchpad.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import Scratchpad from "./Scratchpad.vue";

beforeEach(() => {
  localStorage.clear();
});

describe("Scratchpad", () => {
  it("renders a previously saved value into the textarea", () => {
    localStorage.setItem(
      "lumen:scratchpad:grp/proj#9",
      JSON.stringify("saved note"),
    );
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    expect((w.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "saved note",
    );
  });

  it("persists typing to localStorage", async () => {
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    await w.get("textarea").setValue("typed note");
    await nextTick();
    expect(localStorage.getItem("lumen:scratchpad:grp/proj#9")).toBe(
      JSON.stringify("typed note"),
    );
  });

  it("shows a Saved indicator after an edit", async () => {
    vi.useFakeTimers();
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    expect(w.text()).not.toContain("Saved");
    await w.get("textarea").setValue("edit");
    vi.advanceTimersByTime(600);
    await nextTick();
    expect(w.text()).toContain("Saved");
    vi.useRealTimers();
  });
});
```

Add `vi` to the import line: `import { describe, it, expect, beforeEach, vi } from 'vitest'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- --run src/components/Scratchpad.test.ts`
Expected: FAIL — cannot resolve `./Scratchpad.vue`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/Scratchpad.vue`:

```vue
<script setup lang="ts">
import { ref, toRef, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useScratchpad } from "@/composables/useScratchpad";
import { Textarea } from "@/components/ui/textarea";

const props = defineProps<{ fullPath: string; iid: string }>();
const note = useScratchpad(toRef(props, "fullPath"), toRef(props, "iid"));

// `note` writes to localStorage synchronously; this flag is purely a UX
// affordance. It hides while typing and reappears 500ms after the last edit.
const saved = ref(false);
const flagSaved = useDebounceFn(() => (saved.value = true), 500);
watch(note, () => {
  saved.value = false;
  flagSaved();
});
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center gap-2">
      <h2 class="text-sm font-semibold">Scratchpad</h2>
      <span v-if="saved" class="text-xs text-muted-foreground">Saved</span>
    </div>
    <Textarea
      v-model="note"
      :rows="4"
      placeholder="Private notes, stored only in this browser…"
    />
  </section>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- --run src/components/Scratchpad.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/Scratchpad.vue src/components/Scratchpad.test.ts
git commit -m "feat: add Scratchpad component with debounced Saved indicator"
```

---

## Task 3: Render Scratchpad in IssueDetail

**Files:**

- Modify: `src/views/IssueDetail.vue`

- [ ] **Step 1: Add the import**

In the `<script setup>` block of `src/views/IssueDetail.vue`, add alongside the other component imports (e.g. after the `MarkdownText` import):

```ts
import Scratchpad from "@/components/Scratchpad.vue";
```

- [ ] **Step 2: Render the component**

In the template, add this immediately after the closing `</section>` of the existing Notes section (the `<section class="space-y-3">` that contains the comment form), still inside the `<article>`:

```html
<Scratchpad :full-path="fullPath" :iid="iid" />
```

- [ ] **Step 3: Verify existing tests still pass and types check**

Run: `bun run test -- --run src/views/IssueDetail.test.ts && bun run typecheck`
Expected: PASS — IssueDetail tests green, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/IssueDetail.vue
git commit -m "feat: render Scratchpad on IssueDetail (and thus the drawer)"
```

---

## Final verification

- [ ] **Run the full test suite and typecheck**

Run: `bun run test -- --run && bun run typecheck`
Expected: PASS — entire suite green, no type errors.

- [ ] **Manual smoke check (optional)**

Run `bun run dev`, open an issue, type in the Scratchpad, reload the page, and confirm the text persists. Open the same issue in the drawer and confirm the same text appears. Open a different issue and confirm its scratchpad is empty/independent.

---

## Notes for the implementer

- `useLocalStorage` JSON-encodes string values, so stored entries look like `"text"` (with quotes) — the tests assert against `JSON.stringify(...)` for that reason.
- The `Textarea` ui component uses `useVModel` passively, so `v-model="note"` binds straight through to the localStorage-backed ref.
- Do not add the scratchpad to `IssueDrawer.vue` — it embeds `IssueDetail`, so the single render in Task 3 covers both surfaces.
- This is a personal, single-user tool with TLS verification disabled locally; no auth or multi-user concerns apply to the stored notes.
