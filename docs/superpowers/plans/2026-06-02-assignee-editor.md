# Assignee Editor + Quick Assign Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full assignee editor (stacked rows with full names + add/remove dropdown) to the issue detail view, and simplify QuickAssign into a separate "pick-one-replace" button.

**Architecture:** A new pure `assigneeSections(issue, members)` in `src/lib/assigneeOrder.ts` derives current assignees + relationship-grouped labelled sections (reusing `orderAssignees`). A new `AssigneeEditor.vue` renders removable full-name rows and an additive add/remove dropdown; `QuickAssign.vue` is reduced to a labelled button whose grouped dropdown replaces all assignees with the clicked person. Both own a `useSetAssignees` mutation and bubble errors to `IssueDetail`.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, `@tanstack/vue-query`, `@vueuse/core` (`onClickOutside`), `@lucide/vue`, Vitest + `@vue/test-utils`, bun.

**Spec:** `docs/superpowers/specs/2026-06-02-assignee-editor-design.md`

**IMPORTANT for every task:** run tests with `bunx vitest run <file>` — NEVER `bun run test` (watch mode, hangs). Full suite: `bunx vitest run`. Typecheck: `bun run typecheck`.

---

### Task 1: `assigneeSections` helper

**Files:**
- Modify: `src/lib/assigneeOrder.ts` (append)
- Test: `src/lib/assigneeOrder.test.ts` (append)

- [ ] **Step 1: Write the failing test**

In `src/lib/assigneeOrder.test.ts`, change the import line at the top:

```ts
import { orderAssignees } from "./assigneeOrder";
```

to:

```ts
import { orderAssignees, assigneeSections } from "./assigneeOrder";
```

Then append this block at the end of the file (after the final closing `});` of the existing `describe`):

```ts
describe("assigneeSections", () => {
  const issue = {
    author: { username: "rita", name: "Rita", avatarUrl: null },
    assignees: {
      nodes: [{ username: "ada", name: "Ada", avatarUrl: null }, null],
    },
    notes: {
      nodes: [
        {
          system: false,
          createdAt: "2026-01-01T00:00:00Z",
          author: { username: "cory", name: "Cory", avatarUrl: null },
        },
        {
          system: false,
          createdAt: "2026-01-03T00:00:00Z",
          author: { username: "dee", name: "Dee", avatarUrl: null },
        },
        {
          system: true,
          createdAt: "2026-01-04T00:00:00Z",
          author: { username: "bot", name: "Bot", avatarUrl: null },
        },
        null,
      ],
    },
  };
  const members = [
    { username: "ada", name: "Ada", avatarUrl: null },
    { username: "cory", name: "Cory", avatarUrl: null },
    { username: "evan", name: "Evan", avatarUrl: null },
  ];

  it("returns current assignees with nulls filtered", () => {
    const { assignees } = assigneeSections(issue, members);
    expect(assignees.map((a) => a.username)).toEqual(["ada"]);
  });

  it("groups people into labelled, non-empty sections in canonical order", () => {
    const { sections } = assigneeSections(issue, members);
    expect(sections.map((s) => s.label)).toEqual([
      "Reporter",
      "Assigned",
      "Commented",
      "Project members",
    ]);
    // dee commented more recently than cory
    expect(
      sections.find((s) => s.rel === "commenter")!.people.map((p) => p.username),
    ).toEqual(["dee", "cory"]);
    // ada + cory already shown in higher groups; only evan remains
    expect(
      sections.find((s) => s.rel === "member")!.people.map((p) => p.username),
    ).toEqual(["evan"]);
  });

  it("omits empty groups", () => {
    const { sections } = assigneeSections(
      { author: null, assignees: { nodes: [] }, notes: { nodes: [] } },
      [{ username: "evan", name: "Evan", avatarUrl: null }],
    );
    expect(sections.map((s) => s.rel)).toEqual(["member"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/assigneeOrder.test.ts`
Expected: FAIL — `assigneeSections is not a function` (and/or import error).

- [ ] **Step 3: Write minimal implementation**

Append to the end of `src/lib/assigneeOrder.ts`:

```ts
export interface AssigneeSection {
  rel: Relationship;
  label: string;
  people: OrderedPerson[];
}

export interface AssigneeView {
  assignees: Person[];
  sections: AssigneeSection[];
}

type IssueLike = {
  author?: Person | null;
  assignees?: { nodes?: (Person | null)[] | null } | null;
  notes?: {
    nodes?:
      | ({
          system?: boolean | null;
          createdAt: string;
          author?: Person | null;
        } | null)[]
      | null;
  } | null;
};

const SECTION_LABEL: Record<Relationship, string> = {
  originator: "Reporter",
  assignee: "Assigned",
  commenter: "Commented",
  member: "Project members",
};
const SECTION_ORDER: Relationship[] = [
  "originator",
  "assignee",
  "commenter",
  "member",
];

/**
 * Derive the current assignees and the relationship-grouped, labelled sections
 * for an issue, so the assignee editor and quick-assign share one ordering.
 * `issue` is accepted structurally to keep this module free of generated types.
 */
export function assigneeSections(
  issue: IssueLike,
  members: Person[],
): AssigneeView {
  const assignees = (issue.assignees?.nodes ?? []).filter(
    (a): a is Person => !!a,
  );
  const noteAuthors = (issue.notes?.nodes ?? [])
    .filter(
      (
        n,
      ): n is { system?: boolean | null; createdAt: string; author: Person } =>
        !!n && !n.system && !!n.author,
    )
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((n) => n.author);

  const ordered = orderAssignees({
    author: issue.author ?? null,
    assignees,
    noteAuthors,
    members,
  });

  const sections = SECTION_ORDER.map((rel) => ({
    rel,
    label: SECTION_LABEL[rel],
    people: ordered.filter((p) => p.relationship === rel),
  })).filter((s) => s.people.length);

  return { assignees, sections };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/assigneeOrder.test.ts`
Expected: PASS (10 tests — the original 7 plus 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/assigneeOrder.ts src/lib/assigneeOrder.test.ts
git commit -m "feat: add assigneeSections helper for shared assignee grouping"
```

---

### Task 2: `AssigneeEditor` component

**Files:**
- Create: `src/components/AssigneeEditor.vue`
- Test: `src/components/AssigneeEditor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/AssigneeEditor.test.ts` with EXACTLY this content:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

const { setMutate, errorHolder } = vi.hoisted(() => ({
  setMutate: vi.fn(),
  errorHolder: { ref: null as null | { value: unknown } },
}));
vi.mock("@/composables/useIssueMutations", async () => {
  const { ref } = await import("vue");
  errorHolder.ref = ref(null);
  return {
    useSetAssignees: () => ({
      mutate: setMutate,
      isPending: { value: false },
      error: errorHolder.ref,
    }),
  };
});

import AssigneeEditor from "./AssigneeEditor.vue";

const issue = {
  author: { username: "reporter", name: "Rita Reporter", avatarUrl: null },
  assignees: {
    nodes: [
      { id: "u1", username: "ada", name: "Ada Lovelace", avatarUrl: null },
      { id: "u2", username: "bob", name: "Bob Bk", avatarUrl: null },
    ],
  },
  notes: {
    nodes: [
      {
        id: "n1",
        system: false,
        createdAt: "2026-01-02T00:00:00Z",
        author: { username: "cory", name: "Cory", avatarUrl: null },
      },
    ],
  },
};
const members = [
  { id: "m1", username: "ada", name: "Ada Lovelace", avatarUrl: null },
  { id: "m2", username: "bob", name: "Bob Bk", avatarUrl: null },
  { id: "m3", username: "cory", name: "Cory", avatarUrl: null },
  { id: "m4", username: "dee", name: "Dee", avatarUrl: null },
];

const mountEditor = () =>
  mount(AssigneeEditor, {
    props: { fullPath: "grp/proj", iid: "9", issue: issue as never, members },
  });

beforeEach(() => {
  setMutate.mockReset();
  if (errorHolder.ref) errorHolder.ref.value = null;
});

describe("AssigneeEditor", () => {
  it("renders a row per current assignee showing the full name", () => {
    const w = mountEditor();
    expect(w.find('[data-testid="assignee-remove-ada"]').exists()).toBe(true);
    expect(w.find('[data-testid="assignee-remove-bob"]').exists()).toBe(true);
    expect(w.text()).toContain("Ada Lovelace");
    expect(w.text()).toContain("Bob Bk");
  });

  it("removes a current assignee (commits the minus list)", async () => {
    const w = mountEditor();
    await w.get('[data-testid="assignee-remove-ada"]').trigger("click");
    expect(setMutate).toHaveBeenCalledWith({ assigneeUsernames: ["bob"] });
  });

  it("adds an unassigned member from the dropdown (commits the plus list)", async () => {
    const w = mountEditor();
    await w.get('[data-testid="assignee-add-trigger"]').trigger("click");
    await w.get('[data-testid="assignee-option-dee"]').trigger("click");
    expect(setMutate).toHaveBeenCalledWith({
      assigneeUsernames: ["ada", "bob", "dee"],
    });
  });

  it("removes an already-assigned member from the dropdown (commits the minus list)", async () => {
    const w = mountEditor();
    await w.get('[data-testid="assignee-add-trigger"]').trigger("click");
    await w.get('[data-testid="assignee-option-ada"]').trigger("click");
    expect(setMutate).toHaveBeenCalledWith({ assigneeUsernames: ["bob"] });
  });

  it("re-emits its mutation error so the parent can surface it", async () => {
    const w = mountEditor();
    const failure = { kind: "graphql", message: "Insufficient permissions" };
    errorHolder.ref!.value = failure;
    await nextTick();
    expect(w.emitted("error")?.at(-1)).toEqual([failure]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/AssigneeEditor.test.ts`
Expected: FAIL — cannot resolve `./AssigneeEditor.vue`.

- [ ] **Step 3: Write the component**

Create `src/components/AssigneeEditor.vue` with EXACTLY this content:

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Check, UserPlus, X } from "@lucide/vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import AssigneeAvatar from "@/components/AssigneeAvatar.vue";
import { useSetAssignees } from "@/composables/useIssueMutations";
import { assigneeSections } from "@/lib/assigneeOrder";
import type { GitLabError } from "@/gitlab/errors";
import type { IssueDetail } from "@/composables/useIssue";
import type { ProjectMember } from "@/composables/useProjectMembers";

const props = defineProps<{
  fullPath: string;
  iid: string;
  issue: IssueDetail;
  members: ProjectMember[];
}>();
const emit = defineEmits<{ error: [GitLabError | null] }>();

// fullPath/iid are captured once; mounts per issue route, so props are stable.
const set = useSetAssignees(props.fullPath, props.iid);
// No error UI of its own; bubble mutation failures up to IssueDetail's ErrorNotice.
watch(
  () => set.error.value,
  (e) => emit("error", e),
);

const open = ref(false);
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => (open.value = false));

const view = computed(() => assigneeSections(props.issue, props.members));
const currentUsernames = () => view.value.assignees.map((a) => a.username);

const initial = (p: { name?: string | null; username: string }) =>
  (p.name || p.username).charAt(0).toUpperCase();

function removeOne(username: string) {
  set.mutate({
    assigneeUsernames: currentUsernames().filter((u) => u !== username),
  });
}
// Additive toggle: clicking a member adds them, clicking an assigned one removes
// them. Recomputes the full username list each time (REPLACE semantics).
function toggle(username: string) {
  const cur = currentUsernames();
  set.mutate({
    assigneeUsernames: cur.includes(username)
      ? cur.filter((u) => u !== username)
      : [...cur, username],
  });
}
</script>

<template>
  <div ref="root" class="space-y-2" @keydown.escape="open = false">
    <div v-if="view.assignees.length" class="space-y-1">
      <div
        v-for="a in view.assignees"
        :key="a.username"
        class="flex items-center gap-2"
      >
        <AssigneeAvatar
          :name="a.name || a.username"
          :username="a.username"
          :avatar-url="a.avatarUrl"
        />
        <button
          type="button"
          :data-testid="`assignee-remove-${a.username}`"
          class="rounded p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
          :aria-label="`Remove ${a.name || a.username} as assignee`"
          @click="removeOne(a.username)"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>

    <div class="relative">
      <button
        type="button"
        data-testid="assignee-add-trigger"
        :aria-expanded="open"
        aria-haspopup="menu"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        :disabled="set.isPending.value"
        @click="open = !open"
      >
        <UserPlus class="size-3.5" />
        Add assignee
      </button>

      <div
        v-if="open"
        role="menu"
        class="absolute z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
      >
        <template v-for="section in view.sections" :key="section.rel">
          <p
            class="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{ section.label }}
          </p>
          <button
            v-for="p in section.people"
            :key="p.username"
            type="button"
            :data-testid="`assignee-option-${p.username}`"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
            @click="toggle(p.username)"
          >
            <Avatar class="size-5 text-[10px]">
              <AvatarFallback>{{ initial(p) }}</AvatarFallback>
            </Avatar>
            <span class="min-w-0 flex-1 truncate text-foreground">
              {{ p.name || p.username }}
              <span class="text-muted-foreground">@{{ p.username }}</span>
            </span>
            <Check v-if="p.isAssigned" class="size-3.5 shrink-0 text-primary" />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/AssigneeEditor.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/AssigneeEditor.vue src/components/AssigneeEditor.test.ts
git commit -m "feat: add AssigneeEditor with full-name rows and add/remove dropdown"
```

---

### Task 3: Simplify `QuickAssign`

**Files:**
- Modify (full rewrite): `src/components/QuickAssign.vue`
- Modify: `src/components/QuickAssign.test.ts` (replace the `describe` body)

- [ ] **Step 1: Update the test to the new behavior**

In `src/components/QuickAssign.test.ts`, replace the ENTIRE `describe("QuickAssign", () => { ... });` block (keep everything above it — imports, mock, fixtures, `mountQA`, `beforeEach` — unchanged) with:

```ts
describe("QuickAssign", () => {
  it("shows a 'Quick assign' label on the trigger (no avatars/usernames)", () => {
    const w = mountQA();
    const trigger = w.get('[data-testid="quick-assign-trigger"]');
    expect(trigger.text()).toContain("Quick assign");
    expect(trigger.text()).not.toContain("@");
  });

  it("replaces all assignees with the clicked member and closes", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-option-dee"]').trigger("click");
    expect(setMutate).toHaveBeenCalledWith({ assigneeUsernames: ["dee"] });
    expect(w.find('[role="menu"]').exists()).toBe(false);
  });

  it("shows grouped, labelled, deduped options", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    expect(w.findAll('[data-testid="quick-assign-option-ada"]')).toHaveLength(1);
    expect(w.findAll('[data-testid="quick-assign-option-cory"]')).toHaveLength(1);
    expect(w.text()).toContain("Reporter");
    expect(w.text()).toContain("Assigned");
    expect(w.text()).toContain("Commented");
    expect(w.text()).toContain("Project members");
  });

  it("no longer renders remove or unassign-all controls", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    expect(w.find('[data-testid="quick-assign-remove-ada"]').exists()).toBe(
      false,
    );
    expect(w.find('[data-testid="quick-assign-unassign-all"]').exists()).toBe(
      false,
    );
  });

  it("re-emits its mutation error so the parent can surface it", async () => {
    const w = mountQA();
    const failure = { kind: "graphql", message: "Insufficient permissions" };
    errorHolder.ref!.value = failure;
    await nextTick();
    expect(w.emitted("error")?.at(-1)).toEqual([failure]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/QuickAssign.test.ts`
Expected: FAIL — the "shows a 'Quick assign' label" test fails (current trigger shows avatars/"Assign", not "Quick assign") and/or "no longer renders remove…" fails (those controls still exist).

- [ ] **Step 3: Rewrite the component**

Replace the ENTIRE contents of `src/components/QuickAssign.vue` with EXACTLY:

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Check, UserPlus } from "@lucide/vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSetAssignees } from "@/composables/useIssueMutations";
import { assigneeSections } from "@/lib/assigneeOrder";
import type { GitLabError } from "@/gitlab/errors";
import type { IssueDetail } from "@/composables/useIssue";
import type { ProjectMember } from "@/composables/useProjectMembers";

const props = defineProps<{
  fullPath: string;
  iid: string;
  issue: IssueDetail;
  members: ProjectMember[];
}>();
const emit = defineEmits<{ error: [GitLabError | null] }>();

// fullPath/iid are captured once; QuickAssign mounts per issue route, so the
// props are stable for its lifetime (same assumption as IssueDetail's useUpdateIssue).
const assign = useSetAssignees(props.fullPath, props.iid);
// QuickAssign has no error UI of its own; bubble mutation failures (and their
// clearing, on the next successful mutate) up to IssueDetail's ErrorNotice.
watch(
  () => assign.error.value,
  (e) => emit("error", e),
);

const open = ref(false);
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => (open.value = false));

const view = computed(() => assigneeSections(props.issue, props.members));

const initial = (p: { name?: string | null; username: string }) =>
  (p.name || p.username).charAt(0).toUpperCase();

// Quick assign replaces the whole assignee set with the chosen person; granular
// add/remove lives in AssigneeEditor.
function assignOnly(username: string) {
  assign.mutate({ assigneeUsernames: [username] });
  open.value = false;
}
</script>

<template>
  <div ref="root" class="relative" @keydown.escape="open = false">
    <button
      type="button"
      :aria-expanded="open"
      aria-haspopup="menu"
      data-testid="quick-assign-trigger"
      class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      :disabled="assign.isPending.value"
      @click="open = !open"
    >
      <UserPlus class="size-3.5" />
      Quick assign
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      <template v-for="section in view.sections" :key="section.rel">
        <p
          class="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {{ section.label }}
        </p>
        <button
          v-for="p in section.people"
          :key="p.username"
          type="button"
          :data-testid="`quick-assign-option-${p.username}`"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
          @click="assignOnly(p.username)"
        >
          <Avatar class="size-5 text-[10px]">
            <AvatarFallback>{{ initial(p) }}</AvatarFallback>
          </Avatar>
          <span class="min-w-0 flex-1 truncate text-foreground">
            {{ p.name || p.username }}
            <span class="text-muted-foreground">@{{ p.username }}</span>
          </span>
          <Check v-if="p.isAssigned" class="size-3.5 shrink-0 text-primary" />
        </button>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/QuickAssign.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/QuickAssign.vue src/components/QuickAssign.test.ts
git commit -m "refactor: simplify QuickAssign to a pick-one-replace button"
```

---

### Task 4: Wire AssigneeEditor into IssueDetail

**Files:**
- Modify: `src/views/IssueDetail.vue` (import at line 8 area; `quickAssignError`→`assigneeError` at lines 36 & 39; template assignee block)
- Modify: `src/views/IssueDetail.test.ts` (the first test asserts the assignee name)

- [ ] **Step 1: Update the IssueDetail test**

In `src/views/IssueDetail.test.ts`, replace the body of the test named `"renders title, description, assignee, and user notes"` (it currently opens the quick-assign dropdown to find `@a`) with this — the assignee's full name now renders in the always-visible editor rows:

```ts
  it("renders title, description, assignee, and user notes", async () => {
    useIssue.mockReturnValue({
      data: ref(fullIssue),
      isLoading: ref(false),
      error: ref(null),
    });
    const w = mountDetail();
    await flushPromises();
    expect(w.text()).toContain("Bug");
    expect(w.text()).toContain("the description");
    expect(w.text()).toContain("me too");
    expect(w.text()).toContain("Scratchpad");
    expect(w.text()).toContain("Ada Lovelace");
  });
```

(The `fullIssue` fixture's assignee is `{ id: "u1", name: "Ada Lovelace", username: "a", avatarUrl: null }`, so its full name renders in an AssigneeEditor row. The `useSetAssignees` mock added previously is used by both child components — leave it as is.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/views/IssueDetail.test.ts`
Expected: FAIL — `Ada Lovelace` is not in the rendered text yet (IssueDetail still renders only QuickAssign, whose trigger no longer shows the name).

- [ ] **Step 3: Wire AssigneeEditor into `src/views/IssueDetail.vue`**

(a) Add the import directly after the `QuickAssign` import (currently line 8):

```ts
import QuickAssign from "@/components/QuickAssign.vue";
```

becomes:

```ts
import QuickAssign from "@/components/QuickAssign.vue";
import AssigneeEditor from "@/components/AssigneeEditor.vue";
```

(b) Rename the error ref (currently line 36):

```ts
const quickAssignError = ref<GitLabError | null>(null);
```

to:

```ts
const assigneeError = ref<GitLabError | null>(null);
```

(c) Update the `actionError` computed (currently lines 38-40):

```ts
const actionError = computed(
  () => addNote.error.value ?? updateIssue.error.value ?? quickAssignError.value,
);
```

to:

```ts
const actionError = computed(
  () => addNote.error.value ?? updateIssue.error.value ?? assigneeError.value,
);
```

(d) In the template, replace the existing QuickAssign block:

```vue
    <QuickAssign
      :full-path="fullPath"
      :iid="iid"
      :issue="issue"
      :members="members ?? []"
      @error="quickAssignError = $event"
    />
```

with both controls:

```vue
    <AssigneeEditor
      :full-path="fullPath"
      :iid="iid"
      :issue="issue"
      :members="members ?? []"
      @error="assigneeError = $event"
    />
    <QuickAssign
      :full-path="fullPath"
      :iid="iid"
      :issue="issue"
      :members="members ?? []"
      @error="assigneeError = $event"
    />
```

- [ ] **Step 4: Run the IssueDetail tests**

Run: `bunx vitest run src/views/IssueDetail.test.ts`
Expected: PASS (all tests). The "toggles issue state via the close button" test targets the first `button[type="button"]`, which is still the header Close button (the assignee controls render after the header), so it stays green.

- [ ] **Step 5: Full suite + typecheck**

Run: `bunx vitest run`
Expected: all tests pass.

Run: `bun run typecheck`
Expected: no errors. (`assigneeSections` accepts `IssueDetail`/`ProjectMember[]` structurally; the `v-else-if="issue"` guard narrows `:issue="issue"` for both child components, as it already did for QuickAssign.)

- [ ] **Step 6: Commit**

```bash
git add src/views/IssueDetail.vue src/views/IssueDetail.test.ts
git commit -m "feat: show AssigneeEditor and separate Quick assign button in issue detail"
```

---

## Self-Review

**Spec coverage:**
- Complete assignee list with add/remove → Task 2 (`AssigneeEditor`: stacked rows + add/remove dropdown).
- Current assignees show full name → Task 2 rows via `AssigneeAvatar` (`:name="a.name || a.username"`); asserted in Task 2 and Task 4 tests.
- Quick assign as its own separate button → Task 3 (labelled "Quick assign" trigger, pick-one-replace) + Task 4 (rendered alongside the editor).
- Shared relationship-grouped ordering → Task 1 (`assigneeSections`), consumed by both components.
- REPLACE via existing `useSetAssignees`, immediate commit, errors bubbled to one `assigneeError`/`ErrorNotice` → Tasks 2, 3, 4.
- Drop QuickAssign's ×/Unassign-all → Task 3 (removed; asserted absent).

**Placeholder scan:** none — every step has full code/commands and expected output.

**Type consistency:** `assigneeSections`, `AssigneeView`, `AssigneeSection`, `Relationship`, `Person`, `OrderedPerson` defined in Task 1 are imported/used unchanged in Tasks 2 & 3. `useSetAssignees`'s `{ assigneeUsernames: string[] }` input matches the composable in `src/composables/useIssueMutations.ts`. `data-testid`s are consistent between each component and its test (`assignee-remove-<u>`, `assignee-add-trigger`, `assignee-option-<u>`, `quick-assign-trigger`, `quick-assign-option-<u>`). The `error: [GitLabError | null]` emit matches the `assigneeError` ref type in Task 4.
