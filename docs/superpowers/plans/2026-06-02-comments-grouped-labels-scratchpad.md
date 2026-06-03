# Comments-in-Save, Grouped Label Menus, Collapsible Scratchpad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold comment posting into the issue Save/Cancel buffer, group label menus by scope as nested flyouts (with scoped-label exclusivity when editing), and make the scratchpad collapsible with a content marker.

**Architecture:** The comment becomes a field of the `useIssueDraft` orchestration composable (not the pure `IssueDraft`). Label grouping/selection logic lives in a pure `lib/labelGroups.ts`, rendered by a shared presentational `LabelGroupMenu.vue` consumed by both `LabelPicker` (exclusive per scope) and `IssueFilterPanel` (plain multi). The scratchpad gains a persisted open flag + marker.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, `@tanstack/vue-query`, `@vueuse/core` (`useLocalStorage`), Tailwind v4, lucide, Vitest + `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-06-02-comments-grouped-labels-scratchpad-design.md`

**Conventions:**
- Run one test file: `bunx vitest run <path>`
- Full suite: `bun run test -- --run`
- Typecheck: `bun run typecheck`
- Commit trailer (every commit): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Create:**
- `src/lib/labelGroups.ts` — pure scope grouping + scoped-exclusive toggle
- `src/lib/labelGroups.test.ts`
- `src/components/LabelGroupMenu.vue` — nested flyout (scope rows → value flyout)
- `src/components/LabelGroupMenu.test.ts`

**Modify:**
- `src/components/LabelPicker.vue` (+ test) — use LabelGroupMenu + `toggleScoped`
- `src/components/IssueFilterPanel.vue` (+ test) — labels section uses LabelGroupMenu (multi)
- `src/composables/useIssueDraft.ts` (+ test) — `comment` field folded into dirty/save/reset
- `src/views/IssueDetail.vue` (+ test) — comment bound to draft; remove standalone Comment button
- `src/components/Scratchpad.vue` (+ test) — collapsible + marker + persisted open

---

## Task 1: `lib/labelGroups.ts` — pure grouping + scoped toggle

**Files:**
- Create: `src/lib/labelGroups.ts`
- Test: `src/lib/labelGroups.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/labelGroups.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupLabelsByScope, toggleScoped } from "./labelGroups";

const labels = [
  { id: "l1", title: "bug", color: "#f00" },
  { id: "l2", title: "priority::high", color: "#fa0" },
  { id: "l3", title: "priority::low", color: "#0a0" },
  { id: "l4", title: "type::bug", color: "#00f" },
];

describe("groupLabelsByScope", () => {
  it("groups by scope, preferred scopes first, Other last", () => {
    const groups = groupLabelsByScope(labels);
    expect(groups.map((g) => g.key)).toEqual(["priority", "type", "__none"]);
    expect(groups.at(-1)!.label).toBe("Other");
  });

  it("carries the parsed value and members per group", () => {
    const groups = groupLabelsByScope(labels);
    const priority = groups.find((g) => g.key === "priority")!;
    expect(priority.label).toBe("priority");
    expect(priority.options.map((o) => o.value)).toEqual(["high", "low"]);
    const other = groups.find((g) => g.key === "__none")!;
    expect(other.options.map((o) => o.title)).toEqual(["bug"]);
    expect(other.options[0].value).toBe("bug");
  });

  it("returns an empty array for no labels", () => {
    expect(groupLabelsByScope([])).toEqual([]);
  });
});

describe("toggleScoped", () => {
  it("adds an unscoped label without touching others", () => {
    expect(toggleScoped(["a"], "bug")).toEqual(["a", "bug"]);
  });

  it("removes a label that is already selected", () => {
    expect(toggleScoped(["bug", "x"], "bug")).toEqual(["x"]);
  });

  it("replaces another value in the same scope (exclusivity)", () => {
    expect(toggleScoped(["priority::low", "type::bug"], "priority::high")).toEqual([
      "type::bug",
      "priority::high",
    ]);
  });

  it("toggles a scoped label off when re-selected", () => {
    expect(toggleScoped(["priority::high"], "priority::high")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/lib/labelGroups.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** — `src/lib/labelGroups.ts`:

```ts
// Group labels by their `scope::` for the nested label menus, and toggle a
// selection with scoped-label exclusivity. Pure + framework-free.
import { parseLabel } from "./labels";

export interface LabelLike {
  id: string;
  title: string;
  color: string;
}

export interface ScopeOption extends LabelLike {
  /** Text after the final `::`, or the whole title for an unscoped label. */
  value: string;
}

export interface ScopeGroup {
  /** Scope lowercased, or "__none" for the unscoped group. */
  key: string;
  /** Display name: the scope text (original case), or "Other". */
  label: string;
  scope: string | null;
  options: ScopeOption[];
}

// Well-known scopes sort to the front, in this order; everything else alpha,
// and the unscoped "Other" group always last.
const PREFERRED = ["priority", "type", "workflow", "status", "assigned", "team"];

export function groupLabelsByScope(labels: readonly LabelLike[]): ScopeGroup[] {
  const map = new Map<string, ScopeGroup>();
  for (const l of labels) {
    const p = parseLabel(l.title, l.color);
    const scope = p.scope?.toLowerCase() ?? null;
    const key = scope ?? "__none";
    if (!map.has(key))
      map.set(key, {
        key,
        label: p.scope ?? "Other",
        scope,
        options: [],
      });
    map.get(key)!.options.push({
      id: l.id,
      title: l.title,
      color: l.color,
      value: p.value,
    });
  }
  const rank = (g: ScopeGroup) => {
    if (g.scope === null) return Number.MAX_SAFE_INTEGER;
    const i = PREFERRED.indexOf(g.scope);
    return i === -1 ? 1000 : i;
  };
  return [...map.values()].sort(
    (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label),
  );
}

const scopeOf = (title: string) =>
  parseLabel(title, "").scope?.toLowerCase() ?? null;

/**
 * Toggle `title` in `selected` with scoped-label exclusivity: selecting a scoped
 * value removes any other selected title in the same scope; unscoped labels and
 * de-selection are plain toggles.
 */
export function toggleScoped(selected: string[], title: string): string[] {
  if (selected.includes(title)) return selected.filter((t) => t !== title);
  const scope = scopeOf(title);
  if (scope === null) return [...selected, title];
  return [...selected.filter((t) => scopeOf(t) !== scope), title];
}
```

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/lib/labelGroups.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/labelGroups.ts src/lib/labelGroups.test.ts
git commit -m "feat(labels): pure scope grouping + scoped-exclusive toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `LabelGroupMenu.vue` — nested flyout

**Files:**
- Create: `src/components/LabelGroupMenu.vue`
- Test: `src/components/LabelGroupMenu.test.ts`

Props: `groups: ScopeGroup[]`, `selected: string[]`, `flyoutSide?: "left" | "right"` (default `"right"`). Emits `toggle: [title]`.
Testids: scope row `lgm-scope-<key>`, value option `lgm-opt-<title>`, selected check `lgm-check-<title>`.

- [ ] **Step 1: Write the failing test** — `src/components/LabelGroupMenu.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LabelGroupMenu from "./LabelGroupMenu.vue";
import { groupLabelsByScope } from "@/lib/labelGroups";

const groups = groupLabelsByScope([
  { id: "l1", title: "bug", color: "#f00" },
  { id: "l2", title: "priority::high", color: "#fa0" },
  { id: "l3", title: "priority::low", color: "#0a0" },
]);

const mountMenu = (selected: string[] = []) =>
  mount(LabelGroupMenu, { props: { groups, selected } });

describe("LabelGroupMenu", () => {
  it("renders a row per scope group", () => {
    const w = mountMenu();
    expect(w.find('[data-testid="lgm-scope-priority"]').exists()).toBe(true);
    expect(w.find('[data-testid="lgm-scope-__none"]').exists()).toBe(true);
  });

  it("hides options until a scope row is opened, then shows them", async () => {
    const w = mountMenu();
    expect(w.find('[data-testid="lgm-opt-priority::high"]').exists()).toBe(false);
    await w.get('[data-testid="lgm-scope-priority"]').trigger("click");
    expect(w.find('[data-testid="lgm-opt-priority::high"]').exists()).toBe(true);
    expect(w.find('[data-testid="lgm-opt-priority::low"]').exists()).toBe(true);
  });

  it("emits toggle with the full title when an option is clicked", async () => {
    const w = mountMenu();
    await w.get('[data-testid="lgm-scope-priority"]').trigger("click");
    await w.get('[data-testid="lgm-opt-priority::high"]').trigger("click");
    expect(w.emitted("toggle")?.at(-1)).toEqual(["priority::high"]);
  });

  it("marks selected options with a check", async () => {
    const w = mountMenu(["priority::high"]);
    await w.get('[data-testid="lgm-scope-priority"]').trigger("click");
    expect(w.find('[data-testid="lgm-check-priority::high"]').exists()).toBe(true);
    expect(w.find('[data-testid="lgm-check-priority::low"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/components/LabelGroupMenu.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement** — `src/components/LabelGroupMenu.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { Check, ChevronRight } from "@lucide/vue";
import type { ScopeGroup } from "@/lib/labelGroups";

const props = withDefaults(
  defineProps<{
    groups: ScopeGroup[];
    selected: string[];
    flyoutSide?: "left" | "right";
  }>(),
  { flyoutSide: "right" },
);
const emit = defineEmits<{ toggle: [title: string] }>();

// One scope flyout open at a time.
const openKey = ref<string | null>(null);
function toggleScope(key: string) {
  openKey.value = openKey.value === key ? null : key;
}
const isSelected = (title: string) => props.selected.includes(title);
const countSelected = (g: ScopeGroup) =>
  g.options.filter((o) => isSelected(o.title)).length;
</script>

<template>
  <div
    class="min-w-44"
    @keydown.escape.stop="openKey = null"
  >
    <p
      v-if="!groups.length"
      class="px-2 py-1.5 text-xs text-muted-foreground"
    >
      No labels.
    </p>
    <div
      v-for="g in groups"
      :key="g.key"
      class="relative"
      @mouseenter="openKey = g.key"
    >
      <button
        type="button"
        :data-testid="`lgm-scope-${g.key}`"
        :aria-expanded="openKey === g.key"
        aria-haspopup="menu"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
        @click="toggleScope(g.key)"
      >
        <span class="flex-1 truncate text-foreground">{{ g.label }}</span>
        <span
          v-if="countSelected(g)"
          class="font-mono text-[10px] text-primary tabular-nums"
        >
          {{ countSelected(g) }}
        </span>
        <ChevronRight class="size-3.5 text-muted-foreground" />
      </button>

      <div
        v-if="openKey === g.key"
        role="menu"
        :aria-label="g.label"
        class="absolute top-0 z-50 max-h-60 w-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
        :class="flyoutSide === 'left' ? 'right-full mr-1' : 'left-full ml-1'"
      >
        <button
          v-for="o in g.options"
          :key="o.id"
          type="button"
          role="menuitem"
          :data-testid="`lgm-opt-${o.title}`"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
          @click="emit('toggle', o.title)"
        >
          <span
            class="size-2.5 shrink-0 rounded-full"
            :style="{ backgroundColor: o.color }"
          />
          <span class="flex-1 truncate text-foreground">{{ o.value }}</span>
          <Check
            v-if="isSelected(o.title)"
            :data-testid="`lgm-check-${o.title}`"
            class="size-3.5 text-primary"
          />
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/components/LabelGroupMenu.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/LabelGroupMenu.vue src/components/LabelGroupMenu.test.ts
git commit -m "feat(labels): nested flyout LabelGroupMenu

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `LabelPicker` uses the grouped flyout + scoped exclusivity

**Files:**
- Modify: `src/components/LabelPicker.vue`
- Test: `src/components/LabelPicker.test.ts`

- [ ] **Step 1: Replace the test** — `src/components/LabelPicker.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LabelPicker from "./LabelPicker.vue";

const catalog = [
  { id: "l1", title: "bug", color: "#f00" },
  { id: "l2", title: "priority::high", color: "#fa0" },
  { id: "l3", title: "priority::low", color: "#0a0" },
];

describe("LabelPicker", () => {
  it("toggles an unscoped label, emitting selected titles", async () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: [] } });
    await w.get('[data-testid="label-picker-trigger"]').trigger("click");
    await w.get('[data-testid="lgm-scope-__none"]').trigger("click");
    await w.get('[data-testid="lgm-opt-bug"]').trigger("click");
    expect(w.emitted("update:modelValue")?.at(-1)).toEqual([["bug"]]);
  });

  it("enforces one value per scope (exclusivity)", async () => {
    const w = mount(LabelPicker, {
      props: { catalog, modelValue: ["priority::low"] },
    });
    await w.get('[data-testid="label-picker-trigger"]').trigger("click");
    await w.get('[data-testid="lgm-scope-priority"]').trigger("click");
    await w.get('[data-testid="lgm-opt-priority::high"]').trigger("click");
    expect(w.emitted("update:modelValue")?.at(-1)).toEqual([["priority::high"]]);
  });

  it("deselects an already-selected label", async () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: ["bug"] } });
    await w.get('[data-testid="label-picker-trigger"]').trigger("click");
    await w.get('[data-testid="lgm-scope-__none"]').trigger("click");
    await w.get('[data-testid="lgm-opt-bug"]').trigger("click");
    expect(w.emitted("update:modelValue")?.at(-1)).toEqual([[]]);
  });

  it("renders the selected labels as chips", () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: ["bug"] } });
    expect(w.text()).toContain("bug");
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/components/LabelPicker.test.ts`
Expected: FAIL — `lgm-*` testids absent (still flat list).

- [ ] **Step 3: Rewrite** — `src/components/LabelPicker.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Tag } from "@lucide/vue";
import LabelChip from "./LabelChip.vue";
import LabelGroupMenu from "./LabelGroupMenu.vue";
import { groupLabelsByScope, toggleScoped } from "@/lib/labelGroups";
import type { ProjectLabel } from "@/composables/useProjectLabels";

const props = defineProps<{ catalog: ProjectLabel[]; modelValue: string[] }>();
const emit = defineEmits<{ "update:modelValue": [titles: string[]] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => (open.value = false));

const groups = computed(() => groupLabelsByScope(props.catalog));
function onToggle(title: string) {
  emit("update:modelValue", toggleScoped(props.modelValue, title));
}

const chipFor = (title: string) =>
  props.catalog.find((l) => l.title === title) ?? { title, color: "#888" };
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
        @remove="onToggle(t)"
      />
    </div>

    <div
      v-if="open"
      class="absolute z-50 mt-1 w-56 rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      <LabelGroupMenu :groups="groups" :selected="modelValue" @toggle="onToggle" />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/components/LabelPicker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/LabelPicker.vue src/components/LabelPicker.test.ts
git commit -m "feat(labels): grouped flyout + scoped exclusivity in LabelPicker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `IssueFilterPanel` labels section uses the grouped flyout

**Files:**
- Modify: `src/components/IssueFilterPanel.vue`
- Test: `src/components/IssueFilterPanel.test.ts`

- [ ] **Step 1: Update the test** — replace the two label-related cases in `src/components/IssueFilterPanel.test.ts` (keep the assignee/author/Unassigned/badge cases unchanged). The new label cases:

```ts
  it("opens the panel and lists grouped labels, assignees, authors", async () => {
    const w = mountPanel();
    await w.get('[data-testid="filter-trigger"]').trigger("click");
    // bug + ui are unscoped -> under the Other group row
    expect(w.find('[data-testid="lgm-scope-__none"]').exists()).toBe(true);
    expect(w.find('[data-testid="filter-assignee-ada"]').exists()).toBe(true);
    expect(w.find('[data-testid="filter-author-bob"]').exists()).toBe(true);
  });

  it("toggling a label emits the next label list (multi)", async () => {
    const w = mountPanel({ labels: ["ui"] });
    await w.get('[data-testid="filter-trigger"]').trigger("click");
    await w.get('[data-testid="lgm-scope-__none"]').trigger("click");
    await w.get('[data-testid="lgm-opt-bug"]').trigger("click");
    expect(w.emitted("update:labels")?.at(-1)).toEqual([["ui", "bug"]]);
  });
```

(Delete the old "opens the panel and lists labels, assignees, authors" and "toggling a label emits the next label list" cases they replace. Leave the badge, assignee, and Unassigned tests as-is.)

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/components/IssueFilterPanel.test.ts`
Expected: FAIL — `lgm-*` testids absent.

- [ ] **Step 3: Edit `IssueFilterPanel.vue`**

1. Add imports (after the existing imports):
```ts
import { computed } from "vue";
import LabelGroupMenu from "@/components/LabelGroupMenu.vue";
import { groupLabelsByScope } from "@/lib/labelGroups";
```
   (Note: `ref` is already imported from vue — extend that import to also include `computed`, i.e. `import { computed, ref } from "vue";`, rather than a duplicate import line.)
2. Add a grouped computed alongside the existing logic:
```ts
const labelGroups = computed(() => groupLabelsByScope(props.catalog));
```
3. Replace the entire Labels `<section>` (the one containing the `v-for="l in catalog"` buttons) with:
```vue
      <section class="space-y-1">
        <p
          class="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Labels
        </p>
        <LabelGroupMenu
          :groups="labelGroups"
          :selected="labels"
          flyout-side="left"
          @toggle="toggleLabel"
        />
      </section>
```
   Keep `toggleLabel`, `pickAssignee`, `pickAuthor`, and the Assignee/Author sections exactly as they are. (The `Check` import stays — still used by assignee/author rows.)

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/components/IssueFilterPanel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/IssueFilterPanel.vue src/components/IssueFilterPanel.test.ts
git commit -m "feat(filters): grouped label flyout in IssueFilterPanel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `useIssueDraft` — comment folded into dirty/save/reset

**Files:**
- Modify: `src/composables/useIssueDraft.ts`
- Test: `src/composables/useIssueDraft.test.ts`

- [ ] **Step 1: Update the test** — in `src/composables/useIssueDraft.test.ts`:

1. Add an `addNoteAsync` hoisted mock and an `id` on the issue fixture, and mock `useAddNote`. Replace the top mock block (lines ~5-30) so it reads:
```ts
const { updateAsync, setAsync, addNoteAsync } = vi.hoisted(() => ({
  updateAsync: vi.fn(),
  setAsync: vi.fn(),
  addNoteAsync: vi.fn(),
}));
vi.mock("@/composables/useIssueMutations", () => ({
  useUpdateIssue: () => ({
    mutateAsync: updateAsync,
    isPending: { value: false },
    error: { value: null },
  }),
  useSetAssignees: () => ({
    mutateAsync: setAsync,
    isPending: { value: false },
    error: { value: null },
  }),
  useAddNote: () => ({
    mutateAsync: addNoteAsync,
    isPending: { value: false },
    error: { value: null },
  }),
}));

import { useIssueDraft } from "./useIssueDraft";

const issue = {
  id: "gid://issue/9",
  title: "Bug",
  description: "desc",
  state: "opened",
  labels: { nodes: [{ id: "l1" }] },
  assignees: { nodes: [{ username: "ada" }] },
};
```
2. Extend `beforeEach` to reset the new mock:
```ts
beforeEach(() => {
  updateAsync.mockReset().mockResolvedValue({});
  setAsync.mockReset().mockResolvedValue({});
  addNoteAsync.mockReset().mockResolvedValue({});
});
```
3. Append these cases inside the `describe`:
```ts
  it("a pending comment marks the draft dirty", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() =>
      useIssueDraft("grp/proj", "9", issueRef),
    );
    expect(result().dirty.value).toBe(false);
    result().comment.value = "hello";
    await nextTick();
    expect(result().dirty.value).toBe(true);
  });

  it("save posts the comment then clears it", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() =>
      useIssueDraft("grp/proj", "9", issueRef),
    );
    result().comment.value = "a note";
    await nextTick();
    await result().save();
    expect(addNoteAsync).toHaveBeenCalledWith({
      noteableId: "gid://issue/9",
      body: "a note",
    });
    expect(result().comment.value).toBe("");
    expect(result().dirty.value).toBe(false);
  });

  it("a comment-only save does not call field mutations", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() =>
      useIssueDraft("grp/proj", "9", issueRef),
    );
    result().comment.value = "a note";
    await nextTick();
    await result().save();
    expect(updateAsync).not.toHaveBeenCalled();
    expect(setAsync).not.toHaveBeenCalled();
    expect(addNoteAsync).toHaveBeenCalled();
  });

  it("reset clears a pending comment", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() =>
      useIssueDraft("grp/proj", "9", issueRef),
    );
    result().comment.value = "draft note";
    await nextTick();
    result().reset();
    await nextTick();
    expect(result().comment.value).toBe("");
    expect(result().dirty.value).toBe(false);
  });

  it("keeps the comment when the note post fails", async () => {
    addNoteAsync.mockRejectedValueOnce(new Error("boom"));
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() =>
      useIssueDraft("grp/proj", "9", issueRef),
    );
    result().comment.value = "a note";
    await nextTick();
    await result().save();
    await nextTick();
    expect(result().comment.value).toBe("a note");
    expect(result().dirty.value).toBe(true);
  });
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/composables/useIssueDraft.test.ts`
Expected: FAIL — `comment` not returned; `useAddNote` not used.

- [ ] **Step 3: Edit `src/composables/useIssueDraft.ts`** — full file:

```ts
import { computed, ref, watch, type Ref } from "vue";
import {
  useAddNote,
  useSetAssignees,
  useUpdateIssue,
} from "@/composables/useIssueMutations";
import {
  diffIssueEdit,
  draftFromIssue,
  isDirty,
  type IssueDraft,
} from "@/lib/issueEdit";

// The issue must also carry `id` (the gid) so a pending comment can be posted.
type IssueLike =
  | (Parameters<typeof draftFromIssue>[0] & { id?: string })
  | null
  | undefined;

/**
 * Buffers issue edits: a local `draft` seeded from the server issue, a pending
 * `comment`, a `dirty` flag, and `save()` that fires only the mutations the diff
 * requires plus the comment when present. The draft re-syncs from the server
 * only while clean, so a background refetch never clobbers in-flight edits.
 */
export function useIssueDraft(
  fullPath: string,
  iid: string,
  issue: Ref<IssueLike>,
) {
  const update = useUpdateIssue(fullPath, iid);
  const setAssignees = useSetAssignees(fullPath, iid);
  const addNote = useAddNote(fullPath, iid);

  const original = ref<IssueDraft | null>(null);
  const draft = ref<IssueDraft | null>(null);
  const comment = ref("");

  const cloneDraft = (d: IssueDraft): IssueDraft => ({
    ...d,
    labelIds: [...d.labelIds],
    assigneeUsernames: [...d.assigneeUsernames],
  });

  function sync() {
    if (!issue.value) return;
    original.value = draftFromIssue(issue.value);
    draft.value = draftFromIssue(issue.value);
  }

  const dirty = computed(
    () =>
      (!!original.value &&
        !!draft.value &&
        isDirty(original.value, draft.value)) ||
      comment.value.trim() !== "",
  );
  const saving = computed(
    () =>
      update.isPending.value ||
      setAssignees.isPending.value ||
      addNote.isPending.value,
  );
  const error = computed(
    () =>
      update.error.value ??
      setAssignees.error.value ??
      addNote.error.value ??
      null,
  );

  watch(
    issue,
    () => {
      if (!draft.value || !dirty.value) sync();
    },
    { immediate: true },
  );

  async function save() {
    if (!original.value || !draft.value) return;
    const diff = diffIssueEdit(original.value, draft.value);
    const body = comment.value.trim();
    try {
      if (diff.update) await update.mutateAsync(diff.update);
      if (diff.assignees)
        await setAssignees.mutateAsync({ assigneeUsernames: diff.assignees });
      if (body && issue.value?.id)
        await addNote.mutateAsync({
          noteableId: issue.value.id,
          body: comment.value,
        });
      // Mark clean immediately so the Save/Cancel footer hides; the mutations
      // invalidate the issue query, and the resulting refetch then re-syncs the
      // buffer normally (it is no longer dirty, so the watcher's guard allows it).
      original.value = cloneDraft(draft.value);
      comment.value = "";
    } catch {
      // Surfaced via the `error` computed; leave the draft + comment intact so
      // the user can retry or cancel.
    }
  }

  function reset() {
    sync();
    comment.value = "";
  }

  return { draft, comment, dirty, saving, error, save, reset };
}
```

- [ ] **Step 4: Run, verify pass + typecheck**

Run: `bunx vitest run src/composables/useIssueDraft.test.ts && bun run typecheck`
Expected: PASS (note: `IssueDetail.vue` still binds the old comment ref until Task 6 — but it currently has its own `comment` ref and standalone form, which still typecheck. Task 6 migrates it. If typecheck fails because of `useAddNote` no longer imported in IssueDetail, that's handled in Task 6; this task's typecheck should still pass since IssueDetail is untouched here.)

- [ ] **Step 5: Commit**

```bash
git add src/composables/useIssueDraft.ts src/composables/useIssueDraft.test.ts
git commit -m "feat(edit): fold pending comment into the issue draft

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `IssueDetail` — comment bound to the draft, no standalone Comment button

**Files:**
- Modify: `src/views/IssueDetail.vue`
- Test: `src/views/IssueDetail.test.ts`

- [ ] **Step 1: Update the test** — in `src/views/IssueDetail.test.ts`:

1. Remove the `useIssueMutations` mock (IssueDetail no longer imports it) and drop `addNoteMutate`. Change the hoisted block + mock to:
```ts
const { draftSave, draftReset, draftState } = vi.hoisted(() => ({
  draftSave: vi.fn(),
  draftReset: vi.fn(),
  draftState: {
    dirty: null as null | { value: boolean },
    comment: null as null | { value: string },
  },
}));
```
   (Delete the entire `vi.mock("@/composables/useIssueMutations", ...)` block.)
2. Add `comment` to the `useIssueDraft` mock's returned object:
```ts
vi.mock("@/composables/useIssueDraft", async () => {
  const { ref, computed } = await import("vue");
  return {
    useIssueDraft: () => {
      const draft = ref({
        title: "Bug",
        description: "the description",
        state: "opened",
        labelIds: [] as string[],
        assigneeUsernames: ["a"],
      });
      draftState.dirty = ref(false);
      draftState.comment = ref("");
      return {
        draft,
        comment: draftState.comment,
        dirty: draftState.dirty,
        saving: computed(() => false),
        error: ref(null),
        save: draftSave,
        reset: draftReset,
      };
    },
  };
});
```
3. In `beforeEach`, remove `addNoteMutate.mockReset();`.
4. Replace the "still posts comments" case with these two:
```ts
  it("binds the comment textarea to the draft", async () => {
    const w = mountDetail();
    await flushPromises();
    await w
      .find('textarea[placeholder="Add a comment…"]')
      .setValue("a new comment");
    expect(draftState.comment!.value).toBe("a new comment");
  });

  it("has no standalone Comment button (Save posts the comment)", async () => {
    const w = mountDetail();
    await flushPromises();
    const hasCommentButton = w
      .findAll("button")
      .some((b) => b.text() === "Comment");
    expect(hasCommentButton).toBe(false);
  });
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/views/IssueDetail.test.ts`
Expected: FAIL — comment not bound to draft / Comment button still present.

- [ ] **Step 3: Edit `src/views/IssueDetail.vue`**

1. Remove the `Check` import and the `useAddNote` import. The imports block top becomes:
```ts
import { computed, ref, toRef, watch } from "vue";
import { useTitle } from "@vueuse/core";
import { onBeforeRouteLeave } from "vue-router";
import { useIssue } from "@/composables/useIssue";
import { useIssueDraft } from "@/composables/useIssueDraft";
import { useProjectMembers } from "@/composables/useProjectMembers";
import { useProjectLabels } from "@/composables/useProjectLabels";
import { useConfirm } from "@/composables/useConfirm";
import QuickAssign from "@/components/QuickAssign.vue";
import AssigneeEditor from "@/components/AssigneeEditor.vue";
import LabelPicker from "@/components/LabelPicker.vue";
import StateBadge from "@/components/StateBadge.vue";
import ErrorNotice from "@/components/ErrorNotice.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MarkdownText from "@/components/MarkdownText.vue";
import Scratchpad from "@/components/Scratchpad.vue";
```
2. Remove `const addNote = useAddNote(...)`. Destructure `comment` from the draft API:
```ts
const draftApi = useIssueDraft(props.fullPath, props.iid, issue);
const { draft, comment, dirty, saving, save, reset, error: saveError } = draftApi;
```
3. Replace the `actionError` computed with:
```ts
const actionError = computed(() => saveError.value);
```
4. Delete the local comment state + comment handlers — remove these lines entirely:
   - `const comment = ref("");`
   - `const posted = ref(false);`
   - `let postedTimer ...`
   - the whole `function submitComment() { ... }`
   - `watch(comment, (v) => v && (posted.value = false));`
   Keep `nameOrUsername`, `toggleState`, the title `useTitle`, and the route-leave guard.
5. In the template, replace the comment `<form>...</form>` block (the one with the Comment button + Posted span) with a plain bound textarea (still inside the Notes `<section>`, after the notes `v-for`):
```vue
      <Textarea
        v-model="comment"
        :rows="3"
        placeholder="Add a comment…"
        aria-label="Add a comment"
      />
```

- [ ] **Step 4: Run, verify pass + typecheck**

Run: `bunx vitest run src/views/IssueDetail.test.ts && bun run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/IssueDetail.vue src/views/IssueDetail.test.ts
git commit -m "feat(edit): post comments via Save instead of a separate button

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Collapsible scratchpad with content marker

**Files:**
- Modify: `src/components/Scratchpad.vue`
- Test: `src/components/Scratchpad.test.ts`

- [ ] **Step 1: Add tests** — append to `src/components/Scratchpad.test.ts` inside the `describe`:

```ts
  it("is collapsed by default (textarea hidden)", () => {
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    expect(
      w.get('[data-testid="scratchpad-toggle"]').attributes("aria-expanded"),
    ).toBe("false");
    expect(w.get("textarea").attributes("style")).toContain("display: none");
  });

  it("expands when the header toggle is clicked", async () => {
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    await w.get('[data-testid="scratchpad-toggle"]').trigger("click");
    expect(
      w.get('[data-testid="scratchpad-toggle"]').attributes("aria-expanded"),
    ).toBe("true");
    expect(w.get("textarea").attributes("style") ?? "").not.toContain(
      "display: none",
    );
  });

  it("shows a content marker only when the note has content", () => {
    const empty = mount(Scratchpad, {
      props: { fullPath: "grp/proj", iid: "9" },
    });
    expect(empty.find('[data-testid="scratchpad-marker"]').exists()).toBe(false);

    localStorage.setItem(
      "lumen:scratchpad:grp/proj#8",
      JSON.stringify("has content"),
    );
    const withContent = mount(Scratchpad, {
      props: { fullPath: "grp/proj", iid: "8" },
    });
    expect(
      withContent.find('[data-testid="scratchpad-marker"]').exists(),
    ).toBe(true);
  });

  it("persists the open state per issue", async () => {
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    await w.get('[data-testid="scratchpad-toggle"]').trigger("click");
    expect(localStorage.getItem("lumen:scratchpad-open:grp/proj#9")).toBe(
      JSON.stringify(true),
    );
    const w2 = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    expect(
      w2.get('[data-testid="scratchpad-toggle"]').attributes("aria-expanded"),
    ).toBe("true");
  });
```

(The existing tests still pass: `v-show` keeps the textarea in the DOM, so `w.get("textarea").setValue(...)` works while collapsed.)

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/components/Scratchpad.test.ts`
Expected: FAIL — toggle/marker/persistence absent.

- [ ] **Step 3: Rewrite** — `src/components/Scratchpad.vue`:

```vue
<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import { useDebounceFn, useLocalStorage } from "@vueuse/core";
import { ChevronRight } from "@lucide/vue";
import { useScratchpad } from "@/composables/useScratchpad";
import { Textarea } from "@/components/ui/textarea";

const props = defineProps<{ fullPath: string; iid: string }>();
const note = useScratchpad(toRef(props, "fullPath"), toRef(props, "iid"));

// Open/closed state persisted per issue (mirrors the note's per-issue keying),
// default collapsed. Key getter re-keys when the viewed issue changes.
const open = useLocalStorage(
  () => `lumen:scratchpad-open:${props.fullPath}#${props.iid}`,
  false,
);

const hasContent = computed(() => note.value.trim() !== "");

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
      <button
        type="button"
        data-testid="scratchpad-toggle"
        :aria-expanded="open"
        class="-ml-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-semibold text-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        @click="open = !open"
      >
        <ChevronRight
          class="size-3.5 text-muted-foreground transition-transform duration-150"
          :class="open ? 'rotate-90' : ''"
        />
        Scratchpad
        <span
          v-if="hasContent"
          data-testid="scratchpad-marker"
          aria-label="has notes"
          class="size-1.5 rounded-full bg-primary"
        />
      </button>
      <!-- Live region stays mounted so screen readers announce the status
           change; only the text toggles. -->
      <span aria-live="polite" class="text-xs text-muted-foreground">
        <template v-if="saved">Saved</template>
      </span>
    </div>
    <Textarea
      v-show="open"
      v-model="note"
      :rows="4"
      placeholder="Private notes, stored only in this browser…"
    />
  </section>
</template>
```

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/components/Scratchpad.test.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/Scratchpad.vue src/components/Scratchpad.test.ts
git commit -m "feat(scratchpad): collapsible with content marker + persisted state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Full verification pass

- [ ] **Step 1: Full suite** — Run: `bun run test -- --run` — Expected: all green.
- [ ] **Step 2: Typecheck** — Run: `bun run typecheck` — Expected: clean (exit 0).
- [ ] **Step 3: Format the feature files only** — do NOT run `bun run format` (it reformats the whole repo, which isn't prettier-clean). Format just this plan's touched files:

```bash
bunx prettier --write --experimental-cli \
  src/lib/labelGroups.ts src/lib/labelGroups.test.ts \
  src/components/LabelGroupMenu.vue src/components/LabelGroupMenu.test.ts \
  src/components/LabelPicker.vue src/components/LabelPicker.test.ts \
  src/components/IssueFilterPanel.vue src/components/IssueFilterPanel.test.ts \
  src/composables/useIssueDraft.ts src/composables/useIssueDraft.test.ts \
  src/views/IssueDetail.vue src/views/IssueDetail.test.ts \
  src/components/Scratchpad.vue src/components/Scratchpad.test.ts
```

- [ ] **Step 4: Re-run suite + typecheck after format** — `bun run test -- --run && bun run typecheck` — Expected: green.
- [ ] **Step 5: Manual smoke (user, against live instance)** — `bun dev`, then verify:
  - Detail: type a comment → Save/Cancel footer appears; Save posts it and the footer clears; Cancel discards it; closing the drawer with only a pending comment prompts.
  - Add-label menu: scopes are sub-menus; picking priority::High replaces priority::Low; unscoped labels multi-select.
  - Filter menu: label scopes are sub-menus (flyout opens left); toggling adds/removes filters.
  - Scratchpad: collapsed by default with a dot when it has content; expand state remembered per issue.
- [ ] **Step 6: Commit any format changes**

```bash
git add -A
git commit -m "chore: format comments/labels/scratchpad work

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes (planner)

- **Spec coverage:** F1 → Tasks 5 (composable) + 6 (view). F2 → Tasks 1 (pure) + 2 (menu) + 3 (LabelPicker, exclusivity) + 4 (IssueFilterPanel, multi). F3 → Task 7. Verification → Task 8.
- **Type/name consistency:** `groupLabelsByScope`/`toggleScoped`, `ScopeGroup`/`ScopeOption`, testids `lgm-scope-<key>`/`lgm-opt-<title>`/`lgm-check-<title>`, draft API `{ draft, comment, dirty, saving, error, save, reset }`, scratchpad testids `scratchpad-toggle`/`scratchpad-marker`, open-key `lumen:scratchpad-open:<fullPath>#<iid>` — all consistent across tasks.
- **Ordering/deps:** 2 needs 1; 3 & 4 need 2; 6 needs 5; 7 independent. Sequential 1→8 satisfies all.
- **Risk noted in spec (flyout positioning):** handled via `flyoutSide` prop — LabelPicker uses default right, IssueFilterPanel passes `left` (its popover sits at the toolbar's right edge).
- **Comment edge:** a failed note post leaves comment + dirty intact (Task 5 test "keeps the comment when the note post fails"); `save` only clears on full success.
