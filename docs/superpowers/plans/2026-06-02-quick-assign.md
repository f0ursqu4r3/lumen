# Quick Assign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Quick Assign" dropdown to the issue detail view that reassigns the issue to a single project member, with controls to remove individual assignees or clear them all.

**Architecture:** A pure helper (`src/lib/assigneeOrder.ts`) orders project-related people into relationship groups (originator → current assignees → note authors → other members), deduping each person to their highest group. A `QuickAssign.vue` component renders the trigger + grouped dropdown and owns its `useUpdateIssue` mutation (username-based, immediate per click). `IssueDetail.vue` wires it in, replacing the static assignee-avatar block.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, `@tanstack/vue-query`, `@vueuse/core` (`onClickOutside`), `@lucide/vue` icons, Vitest + `@vue/test-utils`, bun.

**Spec:** `docs/superpowers/specs/2026-06-02-quick-assign-design.md`

---

### Task 1: `orderAssignees` helper

**Files:**
- Create: `src/lib/assigneeOrder.ts`
- Test: `src/lib/assigneeOrder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/assigneeOrder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { orderAssignees } from "./assigneeOrder";

const m = (username: string, name = username) => ({
  username,
  name,
  avatarUrl: null,
});

describe("orderAssignees", () => {
  it("orders groups: originator, assignees, commenters, members", () => {
    const out = orderAssignees({
      author: m("rita"),
      assignees: [m("ada")],
      noteAuthors: [m("cory")],
      members: [m("ada"), m("cory"), m("dee")],
    });
    expect(out.map((p) => p.username)).toEqual(["rita", "ada", "cory", "dee"]);
    expect(out.map((p) => p.relationship)).toEqual([
      "originator",
      "assignee",
      "commenter",
      "member",
    ]);
  });

  it("dedups a person to their highest-priority group", () => {
    const out = orderAssignees({
      author: m("ada"),
      assignees: [m("ada")],
      noteAuthors: [m("ada")],
      members: [m("ada")],
    });
    expect(out).toHaveLength(1);
    expect(out[0].relationship).toBe("originator");
    expect(out[0].isAssigned).toBe(true);
  });

  it("flags current assignees with isAssigned regardless of group", () => {
    const out = orderAssignees({
      author: m("ada"),
      assignees: [m("ada")],
      noteAuthors: [],
      members: [m("dee")],
    });
    const byName = Object.fromEntries(out.map((p) => [p.username, p]));
    expect(byName.ada.isAssigned).toBe(true);
    expect(byName.dee.isAssigned).toBe(false);
  });

  it("keeps caller-supplied note-author order (most recent first)", () => {
    const out = orderAssignees({
      author: null,
      assignees: [],
      noteAuthors: [m("cory"), m("dee")],
      members: [],
    });
    expect(out.map((p) => p.username)).toEqual(["cory", "dee"]);
  });

  it("handles empty author / assignees / notes", () => {
    const out = orderAssignees({
      author: null,
      assignees: [],
      noteAuthors: [],
      members: [m("dee")],
    });
    expect(out.map((p) => p.username)).toEqual(["dee"]);
  });

  it("normalizes missing name to null", () => {
    const out = orderAssignees({
      author: { username: "rita", avatarUrl: null },
      assignees: [],
      noteAuthors: [],
      members: [],
    });
    expect(out[0].name).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/lib/assigneeOrder.test.ts`
Expected: FAIL — `Failed to resolve import "./assigneeOrder"` / `orderAssignees is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/assigneeOrder.ts`:

```ts
export type Relationship = "originator" | "assignee" | "commenter" | "member";

export interface Person {
  username: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface OrderedPerson extends Person {
  name: string | null;
  avatarUrl: string | null;
  relationship: Relationship;
  isAssigned: boolean;
}

/**
 * Order project-related people into relationship groups, deduping each person
 * to the highest-priority group they qualify for. Keyed by username throughout
 * (author and note authors have no id). `noteAuthors` must be pre-sorted
 * most-recent-first and pre-filtered of system notes by the caller.
 */
export function orderAssignees(input: {
  author?: Person | null;
  assignees: Person[];
  noteAuthors: Person[];
  members: Person[];
}): OrderedPerson[] {
  const assigned = new Set(input.assignees.map((a) => a.username));
  const seen = new Set<string>();
  const out: OrderedPerson[] = [];

  const push = (p: Person | null | undefined, relationship: Relationship) => {
    if (!p?.username || seen.has(p.username)) return;
    seen.add(p.username);
    out.push({
      username: p.username,
      name: p.name ?? null,
      avatarUrl: p.avatarUrl ?? null,
      relationship,
      isAssigned: assigned.has(p.username),
    });
  };

  push(input.author, "originator");
  input.assignees.forEach((a) => push(a, "assignee"));
  input.noteAuthors.forEach((n) => push(n, "commenter"));
  input.members.forEach((mb) => push(mb, "member"));

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/lib/assigneeOrder.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/assigneeOrder.ts src/lib/assigneeOrder.test.ts
git commit -m "feat: add assigneeOrder helper for quick-assign ordering"
```

---

### Task 2: `QuickAssign` component

**Files:**
- Create: `src/components/QuickAssign.vue`
- Test: `src/components/QuickAssign.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/QuickAssign.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const { updateMutate } = vi.hoisted(() => ({ updateMutate: vi.fn() }));
vi.mock("@/composables/useIssueMutations", () => ({
  useUpdateIssue: () => ({
    mutate: updateMutate,
    isPending: { value: false },
    error: { value: null },
  }),
}));

import QuickAssign from "./QuickAssign.vue";

const issue = {
  author: { username: "reporter", name: "Rita Reporter", avatarUrl: null },
  assignees: {
    nodes: [{ id: "u1", username: "ada", name: "Ada", avatarUrl: null }],
  },
  notes: {
    nodes: [
      {
        id: "n1",
        system: false,
        createdAt: "2026-01-02T00:00:00Z",
        author: { username: "cory", name: "Cory", avatarUrl: null },
      },
      {
        id: "n2",
        system: true,
        createdAt: "2026-01-03T00:00:00Z",
        author: { username: "bot", name: "Bot", avatarUrl: null },
      },
    ],
  },
};
const members = [
  { id: "m1", username: "ada", name: "Ada", avatarUrl: null },
  { id: "m2", username: "cory", name: "Cory", avatarUrl: null },
  { id: "m3", username: "dee", name: "Dee", avatarUrl: null },
];

const mountQA = () =>
  mount(QuickAssign, {
    props: { fullPath: "grp/proj", iid: "9", issue: issue as never, members },
  });

beforeEach(() => updateMutate.mockReset());

describe("QuickAssign", () => {
  it("assigns a member as the sole assignee on click", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-option-dee"]').trigger("click");
    expect(updateMutate).toHaveBeenCalledWith({ assigneeUsernames: ["dee"] });
  });

  it("removes a single current assignee", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-remove-ada"]').trigger("click");
    expect(updateMutate).toHaveBeenCalledWith({ assigneeUsernames: [] });
  });

  it("unassigns everyone", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-unassign-all"]').trigger("click");
    expect(updateMutate).toHaveBeenCalledWith({ assigneeUsernames: [] });
  });

  it("dedups people to one option and shows group labels", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    expect(w.findAll('[data-testid="quick-assign-option-ada"]')).toHaveLength(1);
    expect(w.findAll('[data-testid="quick-assign-option-cory"]')).toHaveLength(1);
    expect(w.text()).toContain("Reporter");
    expect(w.text()).toContain("Assigned");
    expect(w.text()).toContain("Commented");
    expect(w.text()).toContain("Project members");
  });

  it("hides Unassign all when there are no assignees", async () => {
    const w = mount(QuickAssign, {
      props: {
        fullPath: "grp/proj",
        iid: "9",
        issue: { ...issue, assignees: { nodes: [] } } as never,
        members,
      },
    });
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    expect(w.find('[data-testid="quick-assign-unassign-all"]').exists()).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/components/QuickAssign.test.ts`
Expected: FAIL — `Failed to resolve import "./QuickAssign.vue"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/QuickAssign.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Check, UserPlus, X } from "@lucide/vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useUpdateIssue } from "@/composables/useIssueMutations";
import { orderAssignees, type Relationship } from "@/lib/assigneeOrder";
import type { IssueDetail } from "@/composables/useIssue";
import type { ProjectMember } from "@/composables/useProjectMembers";

const props = defineProps<{
  fullPath: string;
  iid: string;
  issue: IssueDetail;
  members: ProjectMember[];
}>();

const update = useUpdateIssue(props.fullPath, props.iid);

const open = ref(false);
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => (open.value = false));

const assignees = computed(() =>
  (props.issue.assignees?.nodes ?? []).filter(
    (a): a is NonNullable<typeof a> => !!a,
  ),
);

// Distinct, most-recent-first comment authors; system notes excluded.
const noteAuthors = computed(() =>
  (props.issue.notes?.nodes ?? [])
    .filter((n): n is NonNullable<typeof n> => !!n && !n.system && !!n.author)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((n) => n.author!),
);

const ordered = computed(() =>
  orderAssignees({
    author: props.issue.author ?? null,
    assignees: assignees.value,
    noteAuthors: noteAuthors.value,
    members: props.members,
  }),
);

const SECTION_LABEL: Record<Relationship, string> = {
  originator: "Reporter",
  assignee: "Assigned",
  commenter: "Commented",
  member: "Project members",
};
const ORDER: Relationship[] = ["originator", "assignee", "commenter", "member"];
const sections = computed(() =>
  ORDER.map((rel) => ({
    rel,
    label: SECTION_LABEL[rel],
    people: ordered.value.filter((p) => p.relationship === rel),
  })).filter((s) => s.people.length),
);

const initial = (p: { name?: string | null; username: string }) =>
  (p.name || p.username).charAt(0).toUpperCase();

function assignOnly(username: string) {
  update.mutate({ assigneeUsernames: [username] });
  open.value = false;
}
function removeOne(username: string) {
  update.mutate({
    assigneeUsernames: assignees.value
      .map((a) => a.username)
      .filter((u) => u !== username),
  });
}
function unassignAll() {
  update.mutate({ assigneeUsernames: [] });
  open.value = false;
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      data-testid="quick-assign-trigger"
      class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      :disabled="update.isPending.value"
      @click="open = !open"
    >
      <UserPlus class="size-3.5" />
      <template v-if="assignees.length">
        <Avatar v-for="a in assignees" :key="a.id" class="size-5 text-[10px]">
          <AvatarFallback>{{ initial(a) }}</AvatarFallback>
        </Avatar>
      </template>
      <span v-else>Assign</span>
    </button>

    <div
      v-if="open"
      class="absolute z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      <button
        v-if="assignees.length"
        type="button"
        data-testid="quick-assign-unassign-all"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-accent focus-visible:bg-accent"
        @click="unassignAll"
      >
        <X class="size-3.5" />Unassign all
      </button>

      <template v-for="section in sections" :key="section.rel">
        <p
          class="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {{ section.label }}
        </p>
        <div
          v-for="p in section.people"
          :key="p.username"
          class="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
        >
          <button
            type="button"
            :data-testid="`quick-assign-option-${p.username}`"
            class="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:underline"
            @click="assignOnly(p.username)"
          >
            <Avatar class="size-5 text-[10px]">
              <AvatarFallback>{{ initial(p) }}</AvatarFallback>
            </Avatar>
            <span class="min-w-0 flex-1 truncate text-foreground">
              {{ p.name || p.username }}
              <span class="text-muted-foreground">@{{ p.username }}</span>
            </span>
          </button>
          <Check v-if="p.isAssigned" class="size-3.5 shrink-0 text-primary" />
          <button
            v-if="p.isAssigned"
            type="button"
            :data-testid="`quick-assign-remove-${p.username}`"
            class="shrink-0 rounded p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
            aria-label="Remove assignee"
            @click="removeOne(p.username)"
          >
            <X class="size-3.5" />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/components/QuickAssign.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/QuickAssign.vue src/components/QuickAssign.test.ts
git commit -m "feat: add QuickAssign dropdown component"
```

---

### Task 3: Wire QuickAssign into IssueDetail

**Files:**
- Modify: `src/views/IssueDetail.vue` (imports + setup + template assignee block at lines 7, 44-49, 148-156)
- Modify: `src/views/IssueDetail.test.ts` (add `useProjectMembers` mock; open dropdown before asserting `@a`)

- [ ] **Step 1: Update the IssueDetail test for the new structure**

In `src/views/IssueDetail.test.ts`, add a `useProjectMembers` mock alongside the existing mocks (after the `useIssueMutations` mock block, before `import IssueDetail`). It MUST return a real `ref` so Vue template ref-unwrapping works:

```ts
vi.mock("@/composables/useProjectMembers", () => ({
  useProjectMembers: () => ({ data: ref([]) }),
}));
```

Then update the first test (`renders title, description, assignee, and user notes`) — the assignee username now lives inside the closed dropdown, so open it before asserting. Replace its body with:

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
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    expect(w.text()).toContain("@a");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- src/views/IssueDetail.test.ts`
Expected: FAIL — no element matching `[data-testid="quick-assign-trigger"]` (QuickAssign not wired in yet).

- [ ] **Step 3: Wire QuickAssign into IssueDetail.vue**

In `src/views/IssueDetail.vue`:

a) Replace the `AssigneeAvatar` import (line 7) with the QuickAssign import, and add the members composable import. The import block top should read:

```ts
import { useIssue } from "@/composables/useIssue";
import { useProjectMembers } from "@/composables/useProjectMembers";
import { useAddNote, useUpdateIssue } from "@/composables/useIssueMutations";
import QuickAssign from "@/components/QuickAssign.vue";
import LabelChip from "@/components/LabelChip.vue";
```

(Remove the `import AssigneeAvatar from "@/components/AssigneeAvatar.vue";` line.)

b) After the `useIssue(...)` call (around line 25-29), add the members query:

```ts
const { data: members } = useProjectMembers(toRef(props, "fullPath"));
```

c) Remove the now-unused `assignees` computed (current lines 44-49):

```ts
const assignees = computed(
  () =>
    issue.value?.assignees?.nodes?.filter(
      (a): a is NonNullable<typeof a> => !!a,
    ) ?? [],
);
```

d) Replace the static assignee block in the template (current lines 148-156):

```vue
    <div v-if="assignees.length" class="flex flex-wrap gap-2">
      <AssigneeAvatar
        v-for="a in assignees"
        :key="a.id"
        :name="a.name"
        :username="a.username"
        :avatar-url="a.avatarUrl"
      />
    </div>
```

with:

```vue
    <QuickAssign
      :full-path="fullPath"
      :iid="iid"
      :issue="issue"
      :members="members ?? []"
    />
```

- [ ] **Step 4: Run the IssueDetail tests to verify they pass**

Run: `bun run test -- src/views/IssueDetail.test.ts`
Expected: PASS (all tests, including the updated assignee test and the existing "toggles issue state via the close button" — the header Close button is still the first `button[type="button"]`).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `bun run test`
Expected: PASS (whole suite).

Run: `bun run typecheck`
Expected: no errors. (If vue-tsc flags `:issue="issue"` as possibly-null, the `v-else-if="issue"` guard wrapping the `<article>` narrows it; the existing direct `issue.iid` accesses in the same block confirm narrowing already works here.)

- [ ] **Step 6: Commit**

```bash
git add src/views/IssueDetail.vue src/views/IssueDetail.test.ts
git commit -m "feat: wire QuickAssign into issue detail view"
```

---

## Self-Review

**Spec coverage:**
- Trigger + dropdown, replace-on-click, per-assignee ×, Unassign all → Task 2 (component + tests).
- Ordering originator → assignees → note authors → members, dedup, username keying → Task 1 (helper + tests), consumed in Task 2.
- Immediate commit via existing `useUpdateIssue` `assigneeUsernames` → Task 2 (`assignOnly`/`removeOne`/`unassignAll`).
- Wiring + `useProjectMembers` + replacing static block + error surfacing (existing `actionError`) → Task 3.
- No new GraphQL query (reuses `useIssue` author/assignees/notes) → satisfied; `notes` already include `author`, `system`, `createdAt`.

**Placeholder scan:** none — all steps carry full code/commands and expected output.

**Type consistency:** `orderAssignees` / `Relationship` / `OrderedPerson` / `Person` defined in Task 1 are imported and used unchanged in Task 2. `assigneeUsernames` matches the existing `useUpdateIssue` variable type in `src/composables/useIssueMutations.ts`. `IssueDetail` and `ProjectMember` types imported from their existing modules. `data-testid` strings (`quick-assign-trigger`, `quick-assign-option-<username>`, `quick-assign-remove-<username>`, `quick-assign-unassign-all`) match between component template and both test files.
