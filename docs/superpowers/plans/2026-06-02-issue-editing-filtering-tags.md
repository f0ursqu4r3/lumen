# Issue Editing, Filtering & Editable Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make issue detail an explicit Save/Cancel edit form (incl. editable tags + assignees), and give the list/board views a comprehensive, URL-persisted filter panel.

**Architecture:** Pure edit logic lives in `lib/issueEdit.ts`; a `useIssueDraft` composable buffers changes and orchestrates the existing mutations on Save. Filter state lives in `useIssueFilters` (round-tripped to the route query) and drives the already-shared `useIssues` query for both views. A promise-based `useConfirm` + shadcn-vue `alert-dialog` backs the dirty-guard. Assignee controls become controlled (emit into the draft instead of mutating).

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, `@tanstack/vue-query`, `vue-router`, `@vueuse/core`, shadcn-vue (reka-ui), Tailwind v4, Vitest + `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-06-02-issue-editing-filtering-tags-design.md`

**Conventions used below:**
- Run one test file: `bunx vitest run <path>`
- Run all tests: `bun run test -- --run`
- Typecheck: `bun run typecheck`
- Commit trailer (every commit): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Create:**
- `src/lib/issueEdit.ts` — pure draft/diff/dirty logic
- `src/lib/issueEdit.test.ts`
- `src/composables/useIssueDraft.ts` — buffer + Save orchestration
- `src/composables/useIssueDraft.test.ts`
- `src/composables/useIssueFilters.ts` — filter state ↔ URL
- `src/composables/useIssueFilters.test.ts`
- `src/composables/useConfirm.ts` — promise-based confirm singleton
- `src/composables/useConfirm.test.ts`
- `src/components/ConfirmDialog.vue` — renders the confirm, mounted once in App
- `src/components/ConfirmDialog.test.ts`
- `src/components/IssueFilterPanel.vue` — the Filters popover
- `src/components/IssueFilterPanel.test.ts`
- `src/components/ui/alert-dialog/*` — added via shadcn-vue CLI

**Modify:**
- `src/gitlab/issueParams.ts` — add `author`, `assigneeWildcardId` mapping (+ test)
- `src/composables/useIssues.ts` — add `$authorUsername`, `$assigneeWildcardId` to the query
- `src/composables/useIssueMutations.ts` — `useUpdateIssue` accepts `title`/`description`
- `src/components/AssigneeEditor.vue` — controlled (+ test)
- `src/components/QuickAssign.vue` — controlled (+ test)
- `src/views/IssueDetail.vue` — buffered edit form (+ test)
- `src/components/IssueDrawer.vue` — forward dirty + guard close
- `src/views/IssueList.vue` — use `useIssueFilters` + `IssueFilterPanel` (+ test)
- `src/App.vue` — mount `<ConfirmDialog />`

---

# Phase A — Comprehensive Filtering (independent)

## Task 1: Extend filter params with `author` + `Unassigned`

**Files:**
- Modify: `src/gitlab/issueParams.ts`
- Test: `src/gitlab/issueParams.test.ts`

- [ ] **Step 1: Write failing tests** — append these `it` blocks inside the existing `describe("issueParams", …)` in `src/gitlab/issueParams.test.ts`:

```ts
  it("maps author to authorUsername", () => {
    const vars = toIssuesVars("grp/proj", { author: "kdougan" });
    expect(vars).toEqual({ fullPath: "grp/proj", authorUsername: "kdougan" });
  });

  it("maps a normal assignee to assigneeUsernames", () => {
    const vars = toIssuesVars("grp/proj", { assignee: "ada" });
    expect(vars).toEqual({ fullPath: "grp/proj", assigneeUsernames: ["ada"] });
  });

  it("maps the Unassigned sentinel to assigneeWildcardId NONE", () => {
    const vars = toIssuesVars("grp/proj", { assignee: "__none__" });
    expect(vars).toEqual({ fullPath: "grp/proj", assigneeWildcardId: "NONE" });
  });
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/gitlab/issueParams.test.ts`
Expected: FAIL — `authorUsername`/`assigneeWildcardId` not present; `author` not on `IssueFilters`.

- [ ] **Step 3: Implement** — replace the full contents of `src/gitlab/issueParams.ts` with:

```ts
import type {
  IssuableState,
  IssuesQueryVariables,
} from "@/gitlab/generated/graphql";

// `assignee` carries either a username or the `__none__` sentinel (Unassigned).
export const UNASSIGNED = "__none__";

export interface IssueFilters {
  state?: "opened" | "closed" | "all";
  labels?: string[];
  assignee?: string;
  author?: string;
  milestone?: string;
  search?: string;
}

export const issuesKey = (fullPath: string, filters: IssueFilters) =>
  ["issues", fullPath, filters] as const;

export const issueKey = (fullPath: string, iid: string) =>
  ["issue", fullPath, iid] as const;

// Returns the generated IssuesQueryVariables so a GraphQL variable rename is a
// compile error here, not a runtime surprise. Empty/`all` filters map to
// undefined, which graphql-request omits from the request.
export function toIssuesVars(
  fullPath: string,
  filters: IssueFilters,
  after?: string,
): IssuesQueryVariables {
  const assigned =
    filters.assignee && filters.assignee !== UNASSIGNED
      ? [filters.assignee]
      : undefined;
  return {
    fullPath,
    state:
      filters.state && filters.state !== "all"
        ? (filters.state as IssuableState)
        : undefined,
    labelName: filters.labels?.length ? filters.labels : undefined,
    assigneeUsernames: assigned,
    // GitLab models "unassigned" as a wildcard, not an empty username list.
    assigneeWildcardId:
      filters.assignee === UNASSIGNED
        ? ("NONE" as IssuesQueryVariables["assigneeWildcardId"])
        : undefined,
    authorUsername: filters.author || undefined,
    milestoneTitle: filters.milestone ? [filters.milestone] : undefined,
    search: filters.search || undefined,
    after: after || undefined,
  };
}
```

> NOTE: `IssuesQueryVariables` will not yet have `authorUsername`/`assigneeWildcardId` until Task 2's query change is code-generated. Expect a type error here until Task 2 + codegen are done; the runtime test still passes because the test imports the JS only.

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/gitlab/issueParams.test.ts`
Expected: PASS (5+ tests).

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/issueParams.ts src/gitlab/issueParams.test.ts
git commit -m "feat(filters): map author + unassigned to issue query vars

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `authorUsername` + `assigneeWildcardId` to the Issues query (codegen)

**Files:**
- Modify: `src/composables/useIssues.ts:12-61`

- [ ] **Step 1: Edit the query document** — in `src/composables/useIssues.ts`, replace the `graphql(...)` template's variable block and the `issues(...)` argument block so it reads:

```ts
const IssuesDocument = graphql(`
  query Issues(
    $fullPath: ID!
    $state: IssuableState
    $labelName: [String]
    $assigneeUsernames: [String!]
    $assigneeWildcardId: AssigneeWildcardId
    $authorUsername: String
    $milestoneTitle: [String]
    $search: String
    $after: String
  ) {
    project(fullPath: $fullPath) {
      issues(
        state: $state
        labelName: $labelName
        assigneeUsernames: $assigneeUsernames
        assigneeWildcardId: $assigneeWildcardId
        authorUsername: $authorUsername
        milestoneTitle: $milestoneTitle
        search: $search
        first: 50
        after: $after
        sort: UPDATED_DESC
      ) {
```

(Leave the rest of the selection set — `nodes { … } pageInfo { … }` — unchanged.)

- [ ] **Step 2: Regenerate types — USER ACTION REQUIRED**

This step requires reaching the self-hosted GitLab instance and is run by the user (per the design decision). Provide them this command and wait:

```bash
bun codegen
# expands to: NODE_TLS_REJECT_UNAUTHORIZED=0 graphql-codegen --config codegen.ts
```

Expected: `src/gitlab/generated/graphql.ts` updates so `IssuesQueryVariables` gains optional `authorUsername?: string` and `assigneeWildcardId?: AssigneeWildcardId`, and `AssigneeWildcardId` enum includes `NONE`.

> If codegen reveals the instance's `issues()` field lacks `authorUsername` or `assigneeWildcardId`, stop and report — the author filter / Unassigned option must then be dropped from Tasks 4–5 and the spec updated.

- [ ] **Step 3: Verify types compile**

Run: `bun run typecheck`
Expected: PASS (Task 1's `issueParams.ts` casts now resolve against the regenerated types).

- [ ] **Step 4: Commit**

```bash
git add src/composables/useIssues.ts src/gitlab/generated
git commit -m "feat(filters): add authorUsername + assigneeWildcardId to Issues query

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `useIssueFilters` composable (state ↔ URL)

**Files:**
- Create: `src/composables/useIssueFilters.ts`
- Test: `src/composables/useIssueFilters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import { useIssueFilters } from "./useIssueFilters";

function setup(initialQuery: Record<string, string | string[]> = {}) {
  let api!: ReturnType<typeof useIssueFilters>;
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { render: () => null } }],
  });
  const Comp = defineComponent({
    setup() {
      api = useIssueFilters();
      return () => h("div");
    },
  });
  return { router, mountIt: async () => {
    await router.replace({ path: "/", query: initialQuery });
    await router.isReady();
    mount(Comp, { global: { plugins: [router] } });
    await nextTick();
    return api;
  }};
}

describe("useIssueFilters", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hydrates labels/assignee/author/state from the query", async () => {
    const { mountIt } = setup({ label: ["bug", "ui"], assignee: "ada", author: "bob", state: "closed" });
    const api = await mountIt();
    expect(api.labels.value).toEqual(["bug", "ui"]);
    expect(api.assignee.value).toBe("ada");
    expect(api.author.value).toBe("bob");
    expect(api.state.value).toBe("closed");
    expect(api.activeCount.value).toBe(3); // labels(2 -> counts each) ... see note
  });

  it("defaults state to opened and counts active label/assignee/author filters", async () => {
    const { mountIt } = setup();
    const api = await mountIt();
    expect(api.state.value).toBe("opened");
    expect(api.activeCount.value).toBe(0);
  });

  it("toggleLabel writes labels into the route query", async () => {
    const { router, mountIt } = setup();
    const api = await mountIt();
    api.toggleLabel("bug");
    await nextTick();
    expect(router.currentRoute.value.query.label).toEqual("bug");
  });

  it("clearAll removes label/assignee/author but keeps unrelated query keys", async () => {
    const { router, mountIt } = setup({ label: "bug", assignee: "ada", author: "bob", issue: "9" });
    const api = await mountIt();
    api.clearAll();
    await nextTick();
    const q = router.currentRoute.value.query;
    expect(q.label).toBeUndefined();
    expect(q.assignee).toBeUndefined();
    expect(q.author).toBeUndefined();
    expect(q.issue).toBe("9");
  });

  it("debounces search into the query as `q`", async () => {
    const { router, mountIt } = setup();
    const api = await mountIt();
    api.search.value = "crash";
    await nextTick();
    expect(router.currentRoute.value.query.q).toBeUndefined(); // not yet
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(router.currentRoute.value.query.q).toBe("crash");
  });
});
```

> NOTE on `activeCount`: it counts `labels.length + (assignee?1:0) + (author?1:0)`. With 2 labels + assignee + author that is 4, not 3 — fix the first test's expectation to `4` when implementing if you kept 2 labels. (Adjust the assertion to match the implementation in Step 3; do not change the implementation to satisfy a typo.)

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/composables/useIssueFilters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { computed, ref, watch } from "vue";
import { useRoute, useRouter, type LocationQueryRaw } from "vue-router";
import { watchDebounced } from "@vueuse/core";
import type { IssueFilters } from "@/gitlab/issueParams";

type State = NonNullable<IssueFilters["state"]>;

const asArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : typeof v === "string" && v
      ? [v]
      : [];
const asString = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Single source of truth for the issue filters, round-tripped through the route
 * query so links are shareable and back/forward works. Search is held locally
 * and debounced into the URL to keep the text input responsive.
 */
export function useIssueFilters() {
  const route = useRoute();
  const router = useRouter();

  // Merge into the existing query (preserving e.g. ?issue=), dropping empties.
  function patch(
    next: Partial<Record<string, string | string[] | undefined>>,
  ) {
    const query: LocationQueryRaw = { ...route.query };
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "" || (Array.isArray(v) && !v.length))
        delete query[k];
      else query[k] = v;
    }
    router.replace({ query });
  }

  const state = computed<State>({
    get: () => (asString(route.query.state) as State) || "opened",
    set: (v) => patch({ state: v === "opened" ? undefined : v }),
  });
  const labels = computed<string[]>({
    get: () => asArray(route.query.label),
    set: (v) => patch({ label: v }),
  });
  const assignee = computed<string>({
    get: () => asString(route.query.assignee),
    set: (v) => patch({ assignee: v || undefined }),
  });
  const author = computed<string>({
    get: () => asString(route.query.author),
    set: (v) => patch({ author: v || undefined }),
  });

  // Search: local ref bound to the input, debounced out to the URL, hydrated
  // back in on external query changes (back/forward, clearAll).
  const search = ref(asString(route.query.q));
  watchDebounced(search, (v) => patch({ q: v || undefined }), { debounce: 250 });
  watch(
    () => route.query.q,
    (v) => {
      const s = asString(v);
      if (s !== search.value) search.value = s;
    },
  );

  function toggleLabel(title: string) {
    labels.value = labels.value.includes(title)
      ? labels.value.filter((t) => t !== title)
      : [...labels.value, title];
  }
  function clearAll() {
    patch({ label: undefined, assignee: undefined, author: undefined });
  }

  const activeCount = computed(
    () =>
      labels.value.length + (assignee.value ? 1 : 0) + (author.value ? 1 : 0),
  );

  const filters = computed<IssueFilters>(() => ({
    state: state.value,
    search: search.value || undefined,
    labels: labels.value,
    assignee: assignee.value || undefined,
    author: author.value || undefined,
  }));

  return {
    state,
    search,
    labels,
    assignee,
    author,
    activeCount,
    toggleLabel,
    clearAll,
    filters,
  };
}
```

- [ ] **Step 4: Run, verify pass** (fix the `activeCount` assertion noted above to `4` if needed)

Run: `bunx vitest run src/composables/useIssueFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useIssueFilters.ts src/composables/useIssueFilters.test.ts
git commit -m "feat(filters): URL-persisted useIssueFilters composable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `IssueFilterPanel` popover component

**Files:**
- Create: `src/components/IssueFilterPanel.vue`
- Test: `src/components/IssueFilterPanel.test.ts`

Props (controlled): `labels: string[]`, `assignee: string`, `author: string`, `catalog: ProjectLabel[]`, `members: ProjectMember[]`, `activeCount: number`.
Emits: `update:labels`, `update:assignee`, `update:author`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import IssueFilterPanel from "./IssueFilterPanel.vue";

const catalog = [
  { id: "l1", title: "bug", color: "#f00" },
  { id: "l2", title: "ui", color: "#0f0" },
];
const members = [
  { id: "m1", username: "ada", name: "Ada Lovelace", avatarUrl: null },
  { id: "m2", username: "bob", name: "Bob Bk", avatarUrl: null },
];

const mountPanel = (props = {}) =>
  mount(IssueFilterPanel, {
    props: {
      labels: [],
      assignee: "",
      author: "",
      catalog,
      members,
      activeCount: 0,
      ...props,
    },
  });

describe("IssueFilterPanel", () => {
  it("shows the active count badge when filters are set", () => {
    const w = mountPanel({ activeCount: 2 });
    expect(w.get('[data-testid="filter-count"]').text()).toBe("2");
  });

  it("opens the panel and lists labels, assignees, authors", async () => {
    const w = mountPanel();
    await w.get('[data-testid="filter-trigger"]').trigger("click");
    expect(w.find('[data-testid="filter-label-bug"]').exists()).toBe(true);
    expect(w.find('[data-testid="filter-assignee-ada"]').exists()).toBe(true);
    expect(w.find('[data-testid="filter-author-bob"]').exists()).toBe(true);
  });

  it("toggling a label emits the next label list", async () => {
    const w = mountPanel({ labels: ["ui"] });
    await w.get('[data-testid="filter-trigger"]').trigger("click");
    await w.get('[data-testid="filter-label-bug"]').trigger("click");
    expect(w.emitted("update:labels")?.at(-1)).toEqual([["ui", "bug"]]);
  });

  it("choosing an assignee emits the username; choosing it again clears it", async () => {
    const w = mountPanel({ assignee: "" });
    await w.get('[data-testid="filter-trigger"]').trigger("click");
    await w.get('[data-testid="filter-assignee-ada"]').trigger("click");
    expect(w.emitted("update:assignee")?.at(-1)).toEqual(["ada"]);
  });

  it("choosing Unassigned emits the sentinel", async () => {
    const w = mountPanel();
    await w.get('[data-testid="filter-trigger"]').trigger("click");
    await w.get('[data-testid="filter-assignee-__none__"]').trigger("click");
    expect(w.emitted("update:assignee")?.at(-1)).toEqual(["__none__"]);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/components/IssueFilterPanel.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement** — `src/components/IssueFilterPanel.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Check, SlidersHorizontal } from "@lucide/vue";
import { UNASSIGNED } from "@/gitlab/issueParams";
import type { ProjectLabel } from "@/composables/useProjectLabels";
import type { ProjectMember } from "@/composables/useProjectMembers";

const props = defineProps<{
  labels: string[];
  assignee: string;
  author: string;
  catalog: ProjectLabel[];
  members: ProjectMember[];
  activeCount: number;
}>();
const emit = defineEmits<{
  "update:labels": [titles: string[]];
  "update:assignee": [value: string];
  "update:author": [value: string];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => (open.value = false));

const labelSelected = (t: string) => props.labels.includes(t);
function toggleLabel(t: string) {
  emit(
    "update:labels",
    labelSelected(t) ? props.labels.filter((x) => x !== t) : [...props.labels, t],
  );
}
// Single-select with toggle-off: re-picking the active value clears it.
const pickAssignee = (v: string) =>
  emit("update:assignee", props.assignee === v ? "" : v);
const pickAuthor = (v: string) =>
  emit("update:author", props.author === v ? "" : v);
</script>

<template>
  <div ref="root" class="relative" @keydown.escape="open = false">
    <button
      type="button"
      data-testid="filter-trigger"
      :aria-expanded="open"
      class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      @click="open = !open"
    >
      <SlidersHorizontal class="size-4" />
      Filters
      <span
        v-if="activeCount"
        data-testid="filter-count"
        class="ml-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums"
      >
        {{ activeCount }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute z-50 mt-1 w-72 space-y-3 rounded-lg border border-border bg-popover p-3 shadow-md"
    >
      <section class="space-y-1">
        <p class="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Labels
        </p>
        <div class="max-h-40 overflow-y-auto">
          <button
            v-for="l in catalog"
            :key="l.id"
            type="button"
            :data-testid="`filter-label-${l.title}`"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
            @click="toggleLabel(l.title)"
          >
            <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: l.color }" />
            <span class="flex-1 truncate text-foreground">{{ l.title }}</span>
            <Check v-if="labelSelected(l.title)" class="size-3.5 text-primary" />
          </button>
          <p v-if="!catalog.length" class="px-2 py-1.5 text-xs text-muted-foreground">
            No labels.
          </p>
        </div>
      </section>

      <section class="space-y-1">
        <p class="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Assignee
        </p>
        <button
          type="button"
          data-testid="filter-assignee-__none__"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
          @click="pickAssignee(UNASSIGNED)"
        >
          <span class="flex-1 text-foreground">Unassigned</span>
          <Check v-if="assignee === UNASSIGNED" class="size-3.5 text-primary" />
        </button>
        <div class="max-h-32 overflow-y-auto">
          <button
            v-for="m in members"
            :key="m.id"
            type="button"
            :data-testid="`filter-assignee-${m.username}`"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
            @click="pickAssignee(m.username)"
          >
            <span class="min-w-0 flex-1 truncate text-foreground">
              {{ m.name || m.username }}
              <span class="text-muted-foreground">@{{ m.username }}</span>
            </span>
            <Check v-if="assignee === m.username" class="size-3.5 text-primary" />
          </button>
        </div>
      </section>

      <section class="space-y-1">
        <p class="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Author
        </p>
        <div class="max-h-32 overflow-y-auto">
          <button
            v-for="m in members"
            :key="m.id"
            type="button"
            :data-testid="`filter-author-${m.username}`"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
            @click="pickAuthor(m.username)"
          >
            <span class="min-w-0 flex-1 truncate text-foreground">
              {{ m.name || m.username }}
              <span class="text-muted-foreground">@{{ m.username }}</span>
            </span>
            <Check v-if="author === m.username" class="size-3.5 text-primary" />
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/components/IssueFilterPanel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/IssueFilterPanel.vue src/components/IssueFilterPanel.test.ts
git commit -m "feat(filters): IssueFilterPanel popover

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire `IssueList` to `useIssueFilters` + `IssueFilterPanel`

**Files:**
- Modify: `src/views/IssueList.vue`
- Test: `src/views/IssueList.test.ts`

- [ ] **Step 1: Read the current test** to see existing expectations.

Run: `bunx vitest run src/views/IssueList.test.ts`
Expected: PASS (baseline before edits).

- [ ] **Step 2: Edit `IssueList.vue` script** — make these changes:

1. Add imports:
```ts
import { useIssueFilters } from '@/composables/useIssueFilters';
import { useProjectMembers } from '@/composables/useProjectMembers';
import IssueFilterPanel from '@/components/IssueFilterPanel.vue';
```
2. Delete the local filter refs and the `filters` computed (lines defining `state`, `search`, `labelFilters`, `assignee`, and `const filters = computed<IssueFilters>(...)`). Replace with:
```ts
const {
  state,
  search,
  labels: labelTitles,
  assignee,
  author,
  activeCount,
  toggleLabel,
  clearAll,
  filters,
} = useIssueFilters();
const { data: members } = useProjectMembers(toRef(props, 'fullPath'));
```
3. The `STATES` array, `useIssues(...)`, `projectLabels`/`labelCatalog`/`scopeOptions`/board logic stay as-is (they already consume `filters` and `projectLabels`).
4. Replace `applyFacet` so facets write into the shared state, and replace `removeLabel`/`clearFilters`:
```ts
function applyFacet(f: Facet) {
  if (f.kind === 'assignee') {
    assignee.value = assignee.value === f.value ? '' : f.value;
    return;
  }
  toggleLabel(f.value);
}
const removeLabel = (title: string) => toggleLabel(title);
function clearFilters() {
  clearAll();
}
```
5. Add a colored-chip resolver for the active-filter token row (titles no longer carry color):
```ts
const labelChips = computed(() =>
  labelTitles.value.map((title) => ({
    title,
    color: labelCatalog.value.find((l) => l.title === title)?.color ?? '#888',
  })),
);
```

- [ ] **Step 3: Edit `IssueList.vue` template**

1. In "Toolbar row 1", after the search box `<div class="relative min-w-50 flex-1"> … </div>`, add the filter panel before the view toggle:
```vue
<IssueFilterPanel
  v-model:labels="labelTitles"
  v-model:assignee="assignee"
  v-model:author="author"
  :catalog="labelCatalog"
  :members="members ?? []"
  :active-count="activeCount"
/>
```
2. In the "Active filter tokens" block, change the label loop to use `labelChips`, and add an author token next to the assignee token:
```vue
<LabelChip
  v-for="l in labelChips"
  :key="l.title"
  :title="l.title"
  :color="l.color"
  closeable
  @remove="removeLabel(l.title)"
/>
```
   And after the assignee `<span v-if="assignee">…</span>`, add:
```vue
<span
  v-if="author"
  class="inline-flex items-center gap-1 rounded-full bg-muted/60 py-0.5 pr-1 pl-2 text-[11px] font-medium text-foreground/80 ring-1 ring-inset ring-white/10"
>
  <span class="font-mono">author:@{{ author }}</span>
  <button
    type="button"
    aria-label="Remove author filter"
    class="grid size-4 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
    @click="author = ''"
  >
    <X class="size-3" />
  </button>
</span>
```
3. The assignee token shows `@{{ assignee }}`; when `assignee === '__none__'` show "Unassigned" instead:
```vue
<span class="font-mono">{{ assignee === '__none__' ? 'Unassigned' : '@' + assignee }}</span>
```

- [ ] **Step 4: Update the test** — `src/views/IssueList.test.ts` must mount with a router now (the view uses `useRoute`/`useRouter` through `useIssueFilters`). Add at the top a memory-router helper and pass it to `mount`. Replace the mount helper with:

```ts
import { createRouter, createMemoryHistory } from "vue-router";

function routerWith(query = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "issues", component: { render: () => null } },
      { path: "/issue/:iid", name: "issue", component: { render: () => null } },
    ],
  });
  router.replace({ path: "/", query });
  return router;
}
```

Then in each `mount(IssueList, …)` call add `global: { plugins: [routerWith()] }` (merge with any existing `global`). Keep the existing assertions about rendering rows/counts. If a test asserted clicking a label facet set local state, change it to assert the route query gains `label`:
```ts
it("clicking a label facet pushes it to the URL", async () => {
  const router = routerWith();
  await router.isReady();
  // ...mount with this router, click a label chip on a row...
  // expect(router.currentRoute.value.query.label).toBeTruthy();
});
```

> Mock `useProjectMembers` in this test (it now runs in the view) the same way the file already mocks query composables, returning `{ data: ref([]) }`.

- [ ] **Step 5: Run, verify pass**

Run: `bunx vitest run src/views/IssueList.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/IssueList.vue src/views/IssueList.test.ts
git commit -m "feat(filters): wire list/board to filter panel + URL state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# Phase B — Buffered Editing + Editable Tags

## Task 6: `lib/issueEdit.ts` pure logic

**Files:**
- Create: `src/lib/issueEdit.ts`
- Test: `src/lib/issueEdit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { draftFromIssue, isDirty, diffIssueEdit, type IssueDraft } from "./issueEdit";

const issue = {
  title: "Bug",
  description: "desc",
  state: "opened",
  labels: { nodes: [{ id: "l1" }, { id: "l2" }] },
  assignees: { nodes: [{ username: "ada" }] },
};

const base = (): IssueDraft => draftFromIssue(issue);

describe("issueEdit", () => {
  it("draftFromIssue maps fields, ids, usernames; null description -> ''", () => {
    expect(base()).toEqual({
      title: "Bug",
      description: "desc",
      state: "opened",
      labelIds: ["l1", "l2"],
      assigneeUsernames: ["ada"],
    });
    expect(draftFromIssue({ ...issue, description: null }).description).toBe("");
  });

  it("isDirty is false for an identical draft, true on any field change", () => {
    expect(isDirty(base(), base())).toBe(false);
    expect(isDirty(base(), { ...base(), title: "X" })).toBe(true);
    expect(isDirty(base(), { ...base(), labelIds: ["l1"] })).toBe(true);
    expect(isDirty(base(), { ...base(), assigneeUsernames: [] })).toBe(true);
  });

  it("isDirty ignores label/assignee ordering", () => {
    expect(isDirty(base(), { ...base(), labelIds: ["l2", "l1"] })).toBe(false);
  });

  it("diff returns {} when clean", () => {
    expect(diffIssueEdit(base(), base())).toEqual({});
  });

  it("diff emits title/description changes", () => {
    expect(diffIssueEdit(base(), { ...base(), title: "New", description: "d2" }))
      .toEqual({ update: { title: "New", description: "d2" } });
  });

  it("diff maps state opened->closed to CLOSE and closed->opened to REOPEN", () => {
    expect(diffIssueEdit(base(), { ...base(), state: "closed" }))
      .toEqual({ update: { stateEvent: "CLOSE" } });
    const closed = { ...base(), state: "closed" };
    expect(diffIssueEdit(closed, { ...closed, state: "opened" }))
      .toEqual({ update: { stateEvent: "REOPEN" } });
  });

  it("diff computes label add/remove deltas", () => {
    expect(diffIssueEdit(base(), { ...base(), labelIds: ["l2", "l3"] }))
      .toEqual({ update: { addLabelIds: ["l3"], removeLabelIds: ["l1"] } });
  });

  it("diff emits the full next assignee list when changed", () => {
    expect(diffIssueEdit(base(), { ...base(), assigneeUsernames: ["ada", "bob"] }))
      .toEqual({ assignees: ["ada", "bob"] });
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/lib/issueEdit.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// Pure draft/diff logic for buffered issue editing. Kept free of generated types
// (accepts the issue structurally) so it is trivially unit-testable.
export interface IssueDraft {
  title: string;
  description: string;
  state: string; // "opened" | "closed"
  labelIds: string[];
  assigneeUsernames: string[];
}

export function draftFromIssue(issue: {
  title: string;
  description?: string | null;
  state: string;
  labels?: { nodes?: ({ id: string } | null)[] | null } | null;
  assignees?: { nodes?: ({ username: string } | null)[] | null } | null;
}): IssueDraft {
  return {
    title: issue.title,
    description: issue.description ?? "",
    state: issue.state,
    labelIds: (issue.labels?.nodes ?? [])
      .filter((l): l is { id: string } => !!l)
      .map((l) => l.id),
    assigneeUsernames: (issue.assignees?.nodes ?? [])
      .filter((a): a is { username: string } => !!a)
      .map((a) => a.username),
  };
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length &&
  [...a].sort().join(" ") === [...b].sort().join(" ");

export function isDirty(o: IssueDraft, d: IssueDraft): boolean {
  return (
    o.title !== d.title ||
    o.description !== d.description ||
    o.state !== d.state ||
    !sameSet(o.labelIds, d.labelIds) ||
    !sameSet(o.assigneeUsernames, d.assigneeUsernames)
  );
}

export interface IssueEditDiff {
  update?: {
    title?: string;
    description?: string;
    stateEvent?: "CLOSE" | "REOPEN";
    addLabelIds?: string[];
    removeLabelIds?: string[];
  };
  assignees?: string[];
}

export function diffIssueEdit(o: IssueDraft, d: IssueDraft): IssueEditDiff {
  const update: NonNullable<IssueEditDiff["update"]> = {};
  if (o.title !== d.title) update.title = d.title;
  if (o.description !== d.description) update.description = d.description;
  if (o.state !== d.state)
    update.stateEvent = d.state === "closed" ? "CLOSE" : "REOPEN";
  const addLabelIds = d.labelIds.filter((id) => !o.labelIds.includes(id));
  const removeLabelIds = o.labelIds.filter((id) => !d.labelIds.includes(id));
  if (addLabelIds.length) update.addLabelIds = addLabelIds;
  if (removeLabelIds.length) update.removeLabelIds = removeLabelIds;

  const diff: IssueEditDiff = {};
  if (Object.keys(update).length) diff.update = update;
  if (!sameSet(o.assigneeUsernames, d.assigneeUsernames))
    diff.assignees = d.assigneeUsernames;
  return diff;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/lib/issueEdit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/issueEdit.ts src/lib/issueEdit.test.ts
git commit -m "feat(edit): pure issue draft/diff logic

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `useUpdateIssue` accepts `title`/`description`

**Files:**
- Modify: `src/composables/useIssueMutations.ts:180-204`

- [ ] **Step 1: Verify schema support** — confirm `UpdateIssueInput` exposes `title` and `description`:

Run: `grep -n "type UpdateIssueInput" -A 40 src/gitlab/generated/graphql.ts | grep -iE "title|description"`
Expected: both `title?` and `description?` appear on `UpdateIssueInput`.

> If absent: stop. Title/description editing must be cut from Task 12 (render them read-only) and the spec's risk note resolved. The rest of the plan proceeds unchanged.

- [ ] **Step 2: Widen the mutation's variables type** — in `useUpdateIssue`, change the `useMutation` second generic (the variables type) to include title/description:

```ts
  return useMutation<
    UpdateIssuePayload,
    GitLabError,
    {
      title?: string;
      description?: string;
      stateEvent?: "CLOSE" | "REOPEN";
      addLabelIds?: string[];
      removeLabelIds?: string[];
    }
  >({
```

(The `mutationFn` already spreads `...changes` into the input, so no other change is needed.)

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the mutations test** (ensure no regression)

Run: `bunx vitest run src/composables/useIssueMutations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useIssueMutations.ts
git commit -m "feat(edit): allow title/description in useUpdateIssue

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `useIssueDraft` composable

**Files:**
- Create: `src/composables/useIssueDraft.ts`
- Test: `src/composables/useIssueDraft.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";
import { withQuery } from "@/test/withQuery";

const { updateAsync, setAsync } = vi.hoisted(() => ({
  updateAsync: vi.fn(),
  setAsync: vi.fn(),
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
}));

import { useIssueDraft } from "./useIssueDraft";

const issue = {
  title: "Bug",
  description: "desc",
  state: "opened",
  labels: { nodes: [{ id: "l1" }] },
  assignees: { nodes: [{ username: "ada" }] },
};

beforeEach(() => {
  updateAsync.mockReset().mockResolvedValue({});
  setAsync.mockReset().mockResolvedValue({});
});

describe("useIssueDraft", () => {
  it("seeds the draft from the issue and starts clean", () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() => useIssueDraft("grp/proj", "9", issueRef));
    expect(result().draft.value?.title).toBe("Bug");
    expect(result().dirty.value).toBe(false);
  });

  it("becomes dirty on edit and clean after reset", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() => useIssueDraft("grp/proj", "9", issueRef));
    result().draft.value!.title = "New";
    await nextTick();
    expect(result().dirty.value).toBe(true);
    result().reset();
    await nextTick();
    expect(result().dirty.value).toBe(false);
    expect(result().draft.value?.title).toBe("Bug");
  });

  it("save dispatches only the changed mutations", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() => useIssueDraft("grp/proj", "9", issueRef));
    result().draft.value!.title = "New";
    result().draft.value!.assigneeUsernames = ["ada", "bob"];
    await nextTick();
    await result().save();
    expect(updateAsync).toHaveBeenCalledWith({ title: "New" });
    expect(setAsync).toHaveBeenCalledWith({ assigneeUsernames: ["ada", "bob"] });
  });

  it("save with only metadata change does not call setAssignees", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() => useIssueDraft("grp/proj", "9", issueRef));
    result().draft.value!.description = "d2";
    await nextTick();
    await result().save();
    expect(updateAsync).toHaveBeenCalledWith({ description: "d2" });
    expect(setAsync).not.toHaveBeenCalled();
  });

  it("re-syncs from the server only while clean", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() => useIssueDraft("grp/proj", "9", issueRef));
    // dirty edit must survive a background refetch
    result().draft.value!.title = "Mine";
    await nextTick();
    issueRef.value = { ...issue, title: "Server" };
    await nextTick();
    expect(result().draft.value?.title).toBe("Mine");
    // when clean, a refetch updates the draft
    result().reset();
    issueRef.value = { ...issue, title: "Server2" };
    await nextTick();
    expect(result().draft.value?.title).toBe("Server2");
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/composables/useIssueDraft.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
import { computed, ref, watch, type Ref } from "vue";
import {
  useSetAssignees,
  useUpdateIssue,
} from "@/composables/useIssueMutations";
import {
  diffIssueEdit,
  draftFromIssue,
  isDirty,
  type IssueDraft,
} from "@/lib/issueEdit";

type IssueLike = Parameters<typeof draftFromIssue>[0] | null | undefined;

/**
 * Buffers issue edits: a local `draft` seeded from the server issue, a `dirty`
 * flag, and `save()` that fires only the mutations the diff requires. The draft
 * re-syncs from the server only while clean, so a background refetch never
 * clobbers in-flight edits.
 */
export function useIssueDraft(
  fullPath: string,
  iid: string,
  issue: Ref<IssueLike>,
) {
  const update = useUpdateIssue(fullPath, iid);
  const setAssignees = useSetAssignees(fullPath, iid);

  const original = ref<IssueDraft | null>(null);
  const draft = ref<IssueDraft | null>(null);

  function sync() {
    if (!issue.value) return;
    original.value = draftFromIssue(issue.value);
    draft.value = draftFromIssue(issue.value);
  }

  const dirty = computed(
    () => !!original.value && !!draft.value && isDirty(original.value, draft.value),
  );
  const saving = computed(
    () => update.isPending.value || setAssignees.isPending.value,
  );
  const error = computed(
    () => update.error.value ?? setAssignees.error.value ?? null,
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
    try {
      if (diff.update) await update.mutateAsync(diff.update);
      if (diff.assignees)
        await setAssignees.mutateAsync({ assigneeUsernames: diff.assignees });
    } catch {
      // Surfaced via the `error` computed; leave the draft intact so the user
      // can retry or cancel.
    }
  }

  function reset() {
    sync();
  }

  return { draft, dirty, saving, error, save, reset };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/composables/useIssueDraft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useIssueDraft.ts src/composables/useIssueDraft.test.ts
git commit -m "feat(edit): useIssueDraft buffer + save orchestration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Confirm dialog (shadcn-vue alert-dialog + `useConfirm`)

**Files:**
- Create (CLI): `src/components/ui/alert-dialog/*`
- Create: `src/composables/useConfirm.ts`, `src/composables/useConfirm.test.ts`
- Create: `src/components/ConfirmDialog.vue`, `src/components/ConfirmDialog.test.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Add the shadcn-vue alert-dialog** — use the `shadcn-vue` skill (or run the CLI):

```bash
bunx shadcn-vue@latest add alert-dialog
```
Expected: creates `src/components/ui/alert-dialog/` with `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel`, and `index.ts`. Verify it imports cleanly: `bun run typecheck`.

- [ ] **Step 2: Write the failing `useConfirm` test**

```ts
import { describe, it, expect } from "vitest";
import { useConfirm, confirmState } from "./useConfirm";

describe("useConfirm", () => {
  it("opens with the given copy and resolves true on accept", async () => {
    const { confirm } = useConfirm();
    const p = confirm({ title: "Discard?", description: "Unsaved changes" });
    expect(confirmState.open).toBe(true);
    expect(confirmState.title).toBe("Discard?");
    confirmState.resolve?.(true);
    await expect(p).resolves.toBe(true);
    expect(confirmState.open).toBe(false);
  });

  it("resolves false on cancel", async () => {
    const { confirm } = useConfirm();
    const p = confirm({ title: "Discard?" });
    confirmState.resolve?.(false);
    await expect(p).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run, verify failure**

Run: `bunx vitest run src/composables/useConfirm.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `useConfirm.ts`**

```ts
import { reactive } from "vue";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

// Module-level singleton so any caller can `confirm(...)` and one mounted
// <ConfirmDialog/> renders it. Promise-based for use inside navigation guards.
export const confirmState = reactive<
  ConfirmOptions & { open: boolean; resolve: ((v: boolean) => void) | null }
>({
  open: false,
  title: "",
  description: undefined,
  confirmLabel: undefined,
  cancelLabel: undefined,
  resolve: null,
});

export function useConfirm() {
  function confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      confirmState.title = opts.title;
      confirmState.description = opts.description;
      confirmState.confirmLabel = opts.confirmLabel ?? "Discard";
      confirmState.cancelLabel = opts.cancelLabel ?? "Keep editing";
      confirmState.open = true;
      confirmState.resolve = (v: boolean) => {
        confirmState.open = false;
        confirmState.resolve = null;
        resolve(v);
      };
    });
  }
  return { confirm };
}
```

- [ ] **Step 5: Run, verify pass**

Run: `bunx vitest run src/composables/useConfirm.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing `ConfirmDialog` test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import { confirmState, useConfirm } from "@/composables/useConfirm";

beforeEach(() => {
  confirmState.open = false;
  confirmState.resolve = null;
});

describe("ConfirmDialog", () => {
  it("renders the active confirm title and resolves true on the action", async () => {
    const w = mount(ConfirmDialog, { attachTo: document.body });
    const { confirm } = useConfirm();
    const p = confirm({ title: "Discard changes?" });
    await nextTick();
    expect(document.body.textContent).toContain("Discard changes?");
    document.querySelector<HTMLElement>('[data-testid="confirm-accept"]')!.click();
    await expect(p).resolves.toBe(true);
    w.unmount();
  });
});
```

- [ ] **Step 7: Run, verify failure**

Run: `bunx vitest run src/components/ConfirmDialog.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 8: Implement `ConfirmDialog.vue`**

```vue
<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { confirmState } from "@/composables/useConfirm";

// Open is driven by the shared confirmState; closing without choosing counts as
// cancel (resolve false), so backdrop/esc dismissals are safe.
function onOpenChange(open: boolean) {
  if (!open) confirmState.resolve?.(false);
}
</script>

<template>
  <AlertDialog :open="confirmState.open" @update:open="onOpenChange">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ confirmState.title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="confirmState.description">
          {{ confirmState.description }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-testid="confirm-cancel" @click="confirmState.resolve?.(false)">
          {{ confirmState.cancelLabel }}
        </AlertDialogCancel>
        <AlertDialogAction data-testid="confirm-accept" @click="confirmState.resolve?.(true)">
          {{ confirmState.confirmLabel }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
```

- [ ] **Step 9: Mount once in `App.vue`** — import and render `<ConfirmDialog />` at the end of `App.vue`'s template (sibling to the router view):

```vue
import ConfirmDialog from "@/components/ConfirmDialog.vue";
```
```vue
  <ConfirmDialog />
```

- [ ] **Step 10: Run, verify pass + typecheck**

Run: `bunx vitest run src/components/ConfirmDialog.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/components/ui/alert-dialog src/composables/useConfirm.ts src/composables/useConfirm.test.ts src/components/ConfirmDialog.vue src/components/ConfirmDialog.test.ts src/App.vue
git commit -m "feat(edit): promise-based confirm dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Make `AssigneeEditor` controlled

**Files:**
- Modify: `src/components/AssigneeEditor.vue`
- Test: `src/components/AssigneeEditor.test.ts`

New contract: props `{ issue, members, usernames: string[] }` (no `fullPath`/`iid`); emits `update:usernames`. No mutation, no `error` emit.

- [ ] **Step 1: Rewrite the test** — replace `src/components/AssigneeEditor.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import AssigneeEditor from "./AssigneeEditor.vue";

const issue = {
  author: { username: "reporter", name: "Rita Reporter", avatarUrl: null },
  assignees: {
    nodes: [
      { id: "u1", username: "ada", name: "Ada Lovelace", avatarUrl: null },
      { id: "u2", username: "bob", name: "Bob Bk", avatarUrl: null },
    ],
  },
  notes: { nodes: [] },
};
const members = [
  { id: "m1", username: "ada", name: "Ada Lovelace", avatarUrl: null },
  { id: "m2", username: "bob", name: "Bob Bk", avatarUrl: null },
  { id: "m4", username: "dee", name: "Dee", avatarUrl: null },
];

const mountEditor = (usernames = ["ada", "bob"]) =>
  mount(AssigneeEditor, {
    props: { issue: issue as never, members, usernames },
  });

describe("AssigneeEditor (controlled)", () => {
  it("renders a row per current assignee from the usernames prop", () => {
    const w = mountEditor();
    expect(w.find('[data-testid="assignee-remove-ada"]').exists()).toBe(true);
    expect(w.text()).toContain("Ada Lovelace");
  });

  it("removing a current assignee emits the minus list", async () => {
    const w = mountEditor();
    await w.get('[data-testid="assignee-remove-ada"]').trigger("click");
    expect(w.emitted("update:usernames")?.at(-1)).toEqual([["bob"]]);
  });

  it("adding an unassigned member emits the plus list", async () => {
    const w = mountEditor();
    await w.get('[data-testid="assignee-add-trigger"]').trigger("click");
    await w.get('[data-testid="assignee-option-dee"]').trigger("click");
    expect(w.emitted("update:usernames")?.at(-1)).toEqual([["ada", "bob", "dee"]]);
  });

  it("checkmark reflects the usernames prop", async () => {
    const w = mountEditor(["ada"]);
    await w.get('[data-testid="assignee-add-trigger"]').trigger("click");
    expect(w.find('[data-testid="assignee-checked-ada"]').exists()).toBe(true);
    expect(w.find('[data-testid="assignee-checked-dee"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/components/AssigneeEditor.test.ts`
Expected: FAIL — still mutating / wrong props.

- [ ] **Step 3: Rewrite `AssigneeEditor.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Check, UserPlus, X } from "@lucide/vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import AssigneeAvatar from "@/components/AssigneeAvatar.vue";
import { assigneeSections, personInitial, type OrderedPerson } from "@/lib/assigneeOrder";
import type { IssueDetail } from "@/composables/useIssue";
import type { ProjectMember } from "@/composables/useProjectMembers";

const props = defineProps<{
  issue: IssueDetail;
  members: ProjectMember[];
  usernames: string[];
}>();
const emit = defineEmits<{ "update:usernames": [usernames: string[]] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => (open.value = false));

const view = computed(() => assigneeSections(props.issue, props.members));
// Flat index so a username from the buffer resolves to a display name/avatar.
const peopleByUsername = computed(() => {
  const map = new Map<string, OrderedPerson>();
  for (const s of view.value.sections)
    for (const p of s.people) map.set(p.username, p);
  return map;
});
const currentRows = computed(() =>
  props.usernames.map(
    (u) =>
      peopleByUsername.value.get(u) ?? {
        username: u,
        name: null,
        avatarUrl: null,
      },
  ),
);

const isSelected = (u: string) => props.usernames.includes(u);
function removeOne(username: string) {
  emit("update:usernames", props.usernames.filter((u) => u !== username));
}
function toggle(username: string) {
  emit(
    "update:usernames",
    isSelected(username)
      ? props.usernames.filter((u) => u !== username)
      : [...props.usernames, username],
  );
}
</script>

<template>
  <div ref="root" class="space-y-2" @keydown.escape="open = false">
    <div v-if="currentRows.length" class="space-y-1">
      <div v-for="a in currentRows" :key="a.username" class="flex items-center gap-2">
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
        @click="open = !open"
      >
        <UserPlus class="size-3.5" />
        Add assignee
      </button>

      <div
        v-if="open"
        role="menu"
        aria-label="Add assignee"
        class="absolute z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
      >
        <template v-for="section in view.sections" :key="section.rel">
          <p
            role="presentation"
            class="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{ section.label }}
          </p>
          <button
            v-for="p in section.people"
            :key="p.username"
            type="button"
            role="menuitem"
            :data-testid="`assignee-option-${p.username}`"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
            @click="toggle(p.username)"
          >
            <Avatar class="size-5 text-[10px]">
              <AvatarFallback>{{ personInitial(p) }}</AvatarFallback>
            </Avatar>
            <span class="min-w-0 flex-1 truncate text-foreground">
              {{ p.name || p.username }}
              <span class="text-muted-foreground">@{{ p.username }}</span>
            </span>
            <Check
              v-if="isSelected(p.username)"
              :data-testid="`assignee-checked-${p.username}`"
              class="size-3.5 shrink-0 text-primary"
            />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/components/AssigneeEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AssigneeEditor.vue src/components/AssigneeEditor.test.ts
git commit -m "refactor(edit): make AssigneeEditor controlled

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Make `QuickAssign` controlled

**Files:**
- Modify: `src/components/QuickAssign.vue`
- Test: `src/components/QuickAssign.test.ts`

New contract: props `{ issue, members, usernames: string[] }`; emits `update:usernames`; picking a person emits `[username]` (replace).

- [ ] **Step 1: Rewrite the test** — replace `src/components/QuickAssign.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import QuickAssign from "./QuickAssign.vue";

const issue = {
  author: { username: "reporter", name: "Rita", avatarUrl: null },
  assignees: { nodes: [{ id: "u1", username: "ada", name: "Ada", avatarUrl: null }] },
  notes: { nodes: [] },
};
const members = [
  { id: "m1", username: "ada", name: "Ada", avatarUrl: null },
  { id: "m2", username: "bob", name: "Bob", avatarUrl: null },
];

const mountQA = (usernames = ["ada"]) =>
  mount(QuickAssign, { props: { issue: issue as never, members, usernames } });

describe("QuickAssign (controlled)", () => {
  it("emits a single-person replace list when a member is picked", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-option-bob"]').trigger("click");
    expect(w.emitted("update:usernames")?.at(-1)).toEqual([["bob"]]);
  });

  it("checkmark reflects the usernames prop", async () => {
    const w = mountQA(["ada"]);
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    expect(w.find('[data-testid="quick-assign-option-ada"] .text-primary').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/components/QuickAssign.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `QuickAssign.vue`** — change the script to drop `useSetAssignees`/`fullPath`/`iid`/`error`, add `usernames` prop + `update:usernames` emit, and replace `assignOnly`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Check, UserPlus } from "@lucide/vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { assigneeSections, personInitial } from "@/lib/assigneeOrder";
import type { IssueDetail } from "@/composables/useIssue";
import type { ProjectMember } from "@/composables/useProjectMembers";

const props = defineProps<{
  issue: IssueDetail;
  members: ProjectMember[];
  usernames: string[];
}>();
const emit = defineEmits<{ "update:usernames": [usernames: string[]] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => (open.value = false));

const view = computed(() => assigneeSections(props.issue, props.members));

// Quick assign replaces the whole assignee set with the chosen person.
function assignOnly(username: string) {
  emit("update:usernames", [username]);
  open.value = false;
}
</script>
```

Then in the template, change the checkmark condition from `p.isAssigned` to `usernames.includes(p.username)`:

```vue
            <Check
              v-if="usernames.includes(p.username)"
              class="size-3.5 shrink-0 text-primary"
            />
```

(The trigger button no longer needs `:disabled="assign.isPending.value"` — remove that binding.)

- [ ] **Step 4: Run, verify pass**

Run: `bunx vitest run src/components/QuickAssign.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/QuickAssign.vue src/components/QuickAssign.test.ts
git commit -m "refactor(edit): make QuickAssign controlled

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Rebuild `IssueDetail` as a buffered edit form

**Files:**
- Modify: `src/views/IssueDetail.vue`
- Test: `src/views/IssueDetail.test.ts`

This is the integration task. The view keeps comments/notes/scratchpad/error handling as-is; title, description, state, labels, and assignees now bind to the draft, with a Save/Cancel footer and a dirty guard.

- [ ] **Step 1: Rewrite the test** — replace `src/views/IssueDetail.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

const useIssue = vi.fn();
vi.mock("@/composables/useIssue", () => ({ useIssue: () => useIssue() }));

const { addNoteMutate, draftSave, draftReset, draftState } = vi.hoisted(() => ({
  addNoteMutate: vi.fn(),
  draftSave: vi.fn(),
  draftReset: vi.fn(),
  draftState: { dirty: null as null | { value: boolean } },
}));
vi.mock("@/composables/useIssueMutations", () => ({
  useAddNote: () => ({ mutate: addNoteMutate, isPending: { value: false }, error: { value: null } }),
}));
vi.mock("@/composables/useProjectMembers", async () => {
  const { ref } = await import("vue");
  return { useProjectMembers: () => ({ data: ref([]) }) };
});
vi.mock("@/composables/useProjectLabels", async () => {
  const { ref } = await import("vue");
  return { useProjectLabels: () => ({ data: ref([]) }) };
});
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
      return {
        draft,
        dirty: draftState.dirty,
        saving: computed(() => false),
        error: ref(null),
        save: draftSave,
        reset: draftReset,
      };
    },
  };
});
vi.mock("vue-router", () => ({ onBeforeRouteLeave: vi.fn() }));

import IssueDetail from "./IssueDetail.vue";

const fullIssue = {
  id: "gid://issue/9",
  iid: "9",
  title: "Bug",
  description: "the description",
  state: "opened",
  webUrl: "#",
  createdAt: "2026-01-01T00:00:00Z",
  author: { username: "reporter", avatarUrl: null },
  milestone: { title: "v1" },
  labels: { nodes: [] },
  assignees: { nodes: [{ id: "u1", name: "Ada Lovelace", username: "a", avatarUrl: null }] },
  notes: {
    nodes: [
      { id: "n1", body: "me too", system: false, createdAt: "2026-01-01T00:00:00Z", author: { username: "a", avatarUrl: null } },
      { id: "n2", body: "changed milestone", system: true, createdAt: "2026-01-01T00:00:00Z", author: { username: "bot", avatarUrl: null } },
    ],
  },
};

const mountDetail = () =>
  mount(IssueDetail, { props: { fullPath: "grp/proj", iid: "9" } });

beforeEach(() => {
  useIssue.mockReset();
  addNoteMutate.mockReset();
  draftSave.mockReset();
  draftReset.mockReset();
  useIssue.mockReturnValue({ data: ref(fullIssue), isLoading: ref(false), error: ref(null) });
});

describe("IssueDetail (buffered)", () => {
  it("renders the editable title and description bound to the draft", async () => {
    const w = mountDetail();
    await flushPromises();
    expect((w.find('[data-testid="edit-title"]').element as HTMLInputElement).value).toBe("Bug");
    expect(w.text()).toContain("me too");
  });

  it("hides system notes", async () => {
    const w = mountDetail();
    await flushPromises();
    expect(w.text()).not.toContain("changed milestone");
  });

  it("shows the Save/Cancel footer only when dirty", async () => {
    const w = mountDetail();
    await flushPromises();
    expect(w.find('[data-testid="save-issue"]').exists()).toBe(false);
    draftState.dirty!.value = true;
    await flushPromises();
    expect(w.find('[data-testid="save-issue"]').exists()).toBe(true);
  });

  it("Save calls draft.save and Cancel calls draft.reset", async () => {
    const w = mountDetail();
    draftState.dirty!.value = true;
    await flushPromises();
    await w.get('[data-testid="save-issue"]').trigger("click");
    expect(draftSave).toHaveBeenCalled();
    await w.get('[data-testid="cancel-issue"]').trigger("click");
    expect(draftReset).toHaveBeenCalled();
  });

  it("still posts comments", async () => {
    const w = mountDetail();
    await flushPromises();
    await w.find('textarea[placeholder="Add a comment…"]').setValue("a new comment");
    await w.find("form").trigger("submit.prevent");
    expect(addNoteMutate).toHaveBeenCalledWith(
      { noteableId: "gid://issue/9", body: "a new comment" },
      expect.anything(),
    );
  });

  it("toggling state flips the draft (no immediate mutation)", async () => {
    const w = mountDetail();
    await flushPromises();
    await w.get('[data-testid="toggle-state"]').trigger("click");
    // draft is the mocked ref; the close button writes draft.state = "closed"
    expect(w.get('[data-testid="toggle-state"]').text()).toContain("Reopen");
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `bunx vitest run src/views/IssueDetail.test.ts`
Expected: FAIL — new testids / draft wiring absent.

- [ ] **Step 3: Rewrite `IssueDetail.vue`** — full file:

```vue
<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import { useTitle } from "@vueuse/core";
import { onBeforeRouteLeave } from "vue-router";
import { Check } from "@lucide/vue";
import { useIssue } from "@/composables/useIssue";
import { useAddNote } from "@/composables/useIssueMutations";
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

const props = defineProps<{
  fullPath: string;
  iid: string;
  embedded?: boolean;
}>();
const emit = defineEmits<{ "update:dirty": [value: boolean] }>();

const { data: issue, isLoading, error } = useIssue(
  toRef(props, "fullPath"),
  toRef(props, "iid"),
);
const { data: members } = useProjectMembers(toRef(props, "fullPath"));
const { data: labelCatalog } = useProjectLabels(toRef(props, "fullPath"));
const addNote = useAddNote(props.fullPath, props.iid);
const draftApi = useIssueDraft(props.fullPath, props.iid, issue);
const { draft, dirty, saving, save, reset, error: saveError } = draftApi;
const { confirm } = useConfirm();

// Surface the dirty state to a host (the drawer) so it can guard closing.
watch(dirty, (v) => emit("update:dirty", v), { immediate: true });

// Convert label ids <-> titles for the LabelPicker (which works in titles).
const catalog = computed(() => labelCatalog.value ?? []);
const draftLabelTitles = computed<string[]>({
  get: () =>
    (draft.value?.labelIds ?? [])
      .map((id) => catalog.value.find((l) => l.id === id)?.title)
      .filter((t): t is string => !!t),
  set: (titles) => {
    if (!draft.value) return;
    draft.value.labelIds = titles
      .map((t) => catalog.value.find((l) => l.title === t)?.id)
      .filter((id): id is string => !!id);
  },
});

const actionError = computed(() => addNote.error.value ?? saveError.value);

const notes = computed(
  () =>
    issue.value?.notes?.nodes?.filter(
      (n): n is NonNullable<typeof n> => !!n && !n.system,
    ) ?? [],
);

if (!props.embedded) {
  useTitle(
    computed(() =>
      issue.value ? `#${issue.value.iid} ${issue.value.title} · lumen` : "lumen",
    ),
  );
}

const comment = ref("");
const posted = ref(false);
let postedTimer: ReturnType<typeof setTimeout> | undefined;
function nameOrUsername(user?: { name?: string | null; username: string } | null) {
  return user?.name || `@${user?.username}` || "(deleted user)";
}
function submitComment() {
  if (!issue.value || !comment.value.trim()) return;
  addNote.mutate(
    { noteableId: issue.value.id, body: comment.value },
    {
      onSuccess: () => {
        comment.value = "";
        posted.value = true;
        clearTimeout(postedTimer);
        postedTimer = setTimeout(() => (posted.value = false), 2200);
      },
    },
  );
}
watch(comment, (v) => v && (posted.value = false));

function toggleState() {
  if (!draft.value) return;
  draft.value.state = draft.value.state === "opened" ? "closed" : "opened";
}

// Dirty guard on full-page navigation (the drawer handles its own close).
if (!props.embedded) {
  onBeforeRouteLeave(async () => {
    if (!dirty.value) return true;
    return confirm({
      title: "Discard unsaved changes?",
      description: "Your edits to this issue haven't been saved.",
    });
  });
}
</script>

<template>
  <ErrorNotice v-if="error" :error="error" />
  <div v-else-if="isLoading" class="space-y-3">
    <Skeleton class="h-7 w-2/3" />
    <Skeleton class="h-24 w-full" />
  </div>
  <article v-else-if="issue && draft" class="space-y-4 pb-20">
    <header class="flex items-center gap-2">
      <StateBadge :state="draft.state" />
      <span class="font-mono text-sm text-muted-foreground">#{{ issue.iid }}</span>
      <Button
        type="button"
        data-testid="toggle-state"
        variant="outline"
        size="sm"
        class="ml-auto"
        @click="toggleState"
      >
        {{ draft.state === "opened" ? "Close issue" : "Reopen issue" }}
      </Button>
    </header>

    <Input
      v-model="draft.title"
      data-testid="edit-title"
      aria-label="Issue title"
      class="text-lg font-semibold"
    />

    <p class="text-xs text-muted-foreground">
      Opened by
      <span class="font-medium text-foreground">{{ nameOrUsername(issue.author) }}</span>
      · {{ new Date(issue.createdAt).toLocaleString() }}
    </p>

    <ErrorNotice v-if="actionError" :error="actionError" />

    <Textarea
      v-model="draft.description"
      :rows="6"
      aria-label="Issue description"
      placeholder="Add a description…"
    />

    <LabelPicker v-model="draftLabelTitles" :catalog="catalog" />

    <AssigneeEditor
      v-model:usernames="draft.assigneeUsernames"
      :issue="issue"
      :members="members ?? []"
    />
    <QuickAssign
      v-model:usernames="draft.assigneeUsernames"
      :issue="issue"
      :members="members ?? []"
    />
    <p v-if="issue.milestone" class="text-xs text-muted-foreground">
      Milestone: {{ issue.milestone.title }}
    </p>

    <section class="space-y-3">
      <h2 class="text-sm font-semibold">Notes</h2>
      <Card v-for="n in notes" :key="n.id" class="py-0">
        <CardContent class="px-3 py-2 text-sm">
          <span class="font-medium">{{ nameOrUsername(n.author) }}</span>
          <span class="ml-2 text-xs text-muted-foreground">
            {{ new Date(n.createdAt).toLocaleString() }}
          </span>
          <MarkdownText :source="n.body" :project-path="fullPath" class="mt-1" />
        </CardContent>
      </Card>
      <form class="space-y-2" @submit.prevent="submitComment">
        <Textarea v-model="comment" :rows="3" placeholder="Add a comment…" />
        <div class="flex items-center gap-3">
          <Button type="submit" :disabled="addNote.isPending.value">Comment</Button>
          <span aria-live="polite" class="text-xs text-muted-foreground">
            <span v-if="posted" class="animate-status inline-flex items-center gap-1">
              <Check class="size-3.5 text-emerald-400" />Posted
            </span>
          </span>
        </div>
      </form>
    </section>
    <Scratchpad :full-path="fullPath" :iid="iid" />

    <!-- Sticky Save/Cancel — only while there are unsaved edits. -->
    <div
      v-if="dirty"
      class="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur"
    >
      <Button
        type="button"
        data-testid="cancel-issue"
        variant="ghost"
        :disabled="saving"
        @click="reset"
      >
        Cancel
      </Button>
      <Button type="button" data-testid="save-issue" :disabled="saving" @click="save">
        {{ saving ? "Saving…" : "Save changes" }}
      </Button>
    </div>
  </article>
  <p v-else class="text-sm text-muted-foreground">Issue not found.</p>
</template>
```

> NOTE on the test's `vue-router` mock: the test mocks `vue-router` to only export `onBeforeRouteLeave`. `IssueDetail` imports nothing else from `vue-router`, so that mock is sufficient. If a future edit imports `useRoute` here, extend the mock.

- [ ] **Step 4: Run, verify pass + typecheck**

Run: `bunx vitest run src/views/IssueDetail.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/IssueDetail.vue src/views/IssueDetail.test.ts
git commit -m "feat(edit): buffered Save/Cancel issue form with editable tags

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Drawer dirty-guard wiring

**Files:**
- Modify: `src/components/IssueDrawer.vue`
- Modify: `src/views/IssueList.vue`
- Test: `src/components/IssueDrawer.test.ts`

- [ ] **Step 1: Read the current drawer test** for baseline.

Run: `bunx vitest run src/components/IssueDrawer.test.ts`
Expected: PASS (baseline).

- [ ] **Step 2: Forward dirty from `IssueDrawer.vue`** — add an emit and pass it through to `IssueDetail`:

In `<script setup>`:
```ts
const emit = defineEmits<{
  "update:open": [value: boolean];
  expand: [];
  "update:dirty": [value: boolean];
}>();
```
On the `<IssueDetail>` element add:
```vue
        @update:dirty="emit('update:dirty', $event)"
```

- [ ] **Step 3: Guard close in `IssueList.vue`** — add dirty tracking + confirm:

Add imports/state:
```ts
import { useConfirm } from '@/composables/useConfirm';
// ...
const { confirm } = useConfirm();
const drawerDirty = ref(false);
```
Replace `setDrawerOpen` with an async guard:
```ts
async function setDrawerOpen(value: boolean) {
  if (value) return; // opening is driven by issue links, not this handler
  if (drawerDirty.value) {
    const ok = await confirm({
      title: 'Discard unsaved changes?',
      description: "Your edits to this issue haven't been saved.",
    });
    if (!ok) return;
  }
  drawerDirty.value = false;
  const { issue: _issue, ...rest } = route.query;
  router.replace({ query: rest });
}
```
On `<IssueDrawer>` add the dirty binding:
```vue
      @update:dirty="drawerDirty = $event"
```

- [ ] **Step 4: Test the drawer forwards dirty** — append to `src/components/IssueDrawer.test.ts` (stub `IssueDetail` so it emits dirty). If the file stubs child components, add a stub that emits `update:dirty`; otherwise add:

```ts
it("forwards the embedded detail's dirty state", async () => {
  const w = mount(IssueDrawer, {
    props: { open: true, fullPath: "grp/proj", iid: "9" },
    global: {
      stubs: {
        IssueDetail: {
          emits: ["update:dirty"],
          mounted() { this.$emit("update:dirty", true); },
          template: "<div />",
        },
      },
    },
  });
  await w.vm.$nextTick();
  expect(w.emitted("update:dirty")?.at(-1)).toEqual([true]);
});
```

> If `IssueDrawer.test.ts` doesn't exist, create it with the standard mount + this test.

- [ ] **Step 5: Run, verify pass + typecheck + full suite**

Run: `bunx vitest run src/components/IssueDrawer.test.ts src/views/IssueList.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/IssueDrawer.vue src/views/IssueList.vue src/components/IssueDrawer.test.ts
git commit -m "feat(edit): confirm before closing drawer with unsaved edits

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Full verification pass

- [ ] **Step 1: Run the whole suite**

Run: `bun run test -- --run`
Expected: all tests PASS.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Format**

Run: `bun run format`

- [ ] **Step 4: Manual smoke test (user, against live instance)**

Run: `bun dev`, then verify:
- Detail: edit title/description, add/remove a tag, change assignees, toggle state → Save persists; Cancel reverts; closing the drawer mid-edit prompts.
- List + board: open Filters, pick labels/assignee/author/Unassigned → list narrows, URL reflects filters, reload preserves them, "Clear all" resets.

- [ ] **Step 5: Final commit (if formatting changed anything)**

```bash
git add -A
git commit -m "chore: format issue editing/filtering work

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes (planner)

- **Spec coverage:** Feature 1 (buffered Save/Cancel) → Tasks 6–8, 12; dirty guard → Tasks 9, 12, 13. Feature 2 (filtering: labels/assignee/author, popover, URL) → Tasks 1–5. Feature 3 (editable tags) → Task 12 (LabelPicker bound to `draftLabelTitles`) on top of Task 6 diff + Task 7 mutation. QuickAssign kept + controlled → Task 11. ConfirmDialog via shadcn-vue → Task 9. Codegen by user → Task 2.
- **Deviation from spec (flag for review):** spec listed assignee "Any/Unassigned"; plan implements **Unassigned** via a new `assigneeWildcardId` var (Task 1/2) and "Any" = no selection. This adds one query var beyond the spec's `authorUsername` — both regenerated in the same `bun codegen` run.
- **Type consistency:** draft shape `{title, description, state, labelIds, assigneeUsernames}` is identical across `issueEdit.ts`, `useIssueDraft.ts`, and `IssueDetail.vue`. Assignee components use the `usernames` prop + `update:usernames` emit consistently. `UNASSIGNED = "__none__"` sentinel shared from `issueParams.ts`.
- **Dependency order:** Task 2 (codegen) gates typecheck for Tasks 1, 5. Tasks 6–11 are independent of Phase A and can run in any order before Task 12. Task 12 depends on 6,7,8,9,10,11. Task 13 depends on 9,12.
