<script setup lang="ts">
import { computed, onUnmounted, ref, toRef, watch } from "vue";
import { useIntersectionObserver, useTitle, onKeyStroke } from "@vueuse/core";
import {
  Plus,
  Search,
  LoaderCircle,
  List,
  Columns3,
  X,
  GripVertical,
} from "@lucide/vue";
import { useIssues, type IssueListItem } from "@/composables/useIssues";
import { useProjectLabels } from "@/composables/useProjectLabels";
import { useProjectMembers } from "@/composables/useProjectMembers";
import { useIssueFilters } from "@/composables/useIssueFilters";
import { useRetagIssue } from "@/composables/useIssueMutations";
import IssueComposer from "@/components/IssueComposer.vue";
import IssueFilterPanel from "@/components/IssueFilterPanel.vue";
import type { IssueFilters } from "@/gitlab/issueParams";
import {
  sortIssues,
  groupIssues,
  groupByScope,
  labelScopes,
  planRetag,
  SORTS,
  GROUPS,
  type SortKey,
  type GroupKey,
  type Facet,
  type IssueGroup,
} from "@/lib/issueView";
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "@/composables/useConfirm";
import IssueRow from "@/components/IssueRow.vue";
import IssueCard from "@/components/IssueCard.vue";
import IssueDrawer from "@/components/IssueDrawer.vue";
import LabelChip from "@/components/LabelChip.vue";
import ErrorNotice from "@/components/ErrorNotice.vue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const props = defineProps<{ fullPath: string }>();

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const drawerDirty = ref(false);

// Drawer is driven by ?issue=<iid> on this route, so back/refresh/links all work.
const openIid = computed(() => {
  const q = route.query.issue;
  return typeof q === "string" && q ? q : null;
});

async function setDrawerOpen(value: boolean) {
  if (value) return; // opening is driven by issue links, not this handler
  if (drawerDirty.value) {
    const ok = await confirm({
      title: "Discard unsaved changes?",
      description: "Your edits to this issue haven't been saved.",
    });
    if (!ok) return;
  }
  drawerDirty.value = false;
  const { issue: _issue, ...rest } = route.query;
  router.replace({ query: rest });
}

function expandIssue() {
  if (openIid.value) {
    router.push({
      name: "issue",
      params: { fullPath: props.fullPath, iid: openIid.value },
    });
  }
}

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
const { data: members } = useProjectMembers(toRef(props, "fullPath"));

const view = ref<"list" | "board">("list");
const sortKey = ref<SortKey>("updated");
const groupKey = ref<GroupKey>("none");
// Which scoped-label group defines the board columns (assigned / priority / team…).
const boardScope = ref("assigned");

type StateValue = NonNullable<IssueFilters["state"]>;
const STATES: { value: StateValue; label: string }[] = [
  { value: "opened", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

// Split the project path so the final segment (the repo) can be emphasized.
const pathParts = computed(() => props.fullPath.split("/"));
const repoName = computed(() => pathParts.value.at(-1) ?? props.fullPath);
const pathPrefix = computed(() => pathParts.value.slice(0, -1).join("/"));

// Reflect the active repo in the tab title — quiet polish for a daily driver
// that lives across many tabs.
useTitle(computed(() => `${repoName.value} · lumen`));

const {
  issues,
  isLoading,
  error,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
} = useIssues(toRef(props, "fullPath"), filters);

const count = computed(() => issues.value.length);
const hasMore = computed(() => hasNextPage.value ?? false);

// Sort/group happen client-side on the loaded set — priority & status live in
// scoped labels, which the server can't order by.
const sorted = computed(() => sortIssues(issues.value, sortKey.value));
const listGroups = computed(() => groupIssues(sorted.value, groupKey.value));

const { data: projectLabels } = useProjectLabels(toRef(props, "fullPath"));
const labelCatalog = computed(() => projectLabels.value ?? []);
const scopeOptions = computed(() => labelScopes(labelCatalog.value));
const boardGroups = computed(() =>
  groupByScope(sorted.value, boardScope.value, labelCatalog.value),
);
// When the chosen scope isn't present (e.g. first load), fall back to the first.
watch(scopeOptions, (opts) => {
  if (opts.length && !opts.includes(boardScope.value))
    boardScope.value = opts[0];
});

// --- drag to retag ----------------------------------------------------------
const retag = useRetagIssue(props.fullPath);
const dragging = ref<IssueListItem | null>(null);
const draggingIid = ref<string | null>(null);
const dragOverKey = ref<string | null>(null);

function onDragStart(issue: IssueListItem, e: DragEvent) {
  dragging.value = issue;
  draggingIid.value = issue.iid;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(issue.iid));
  }
}
function clearDrag() {
  dragging.value = null;
  draggingIid.value = null;
  dragOverKey.value = null;
}
function onDrop(group: IssueGroup) {
  const issue = dragging.value;
  clearDrag();
  if (!issue) return;
  const plan = planRetag(issue, boardScope.value, group.repLabel ?? null);
  if (plan) retag.mutate({ iid: issue.iid, ...plan });
}

// --- active filters ---------------------------------------------------------
function applyFacet(f: Facet) {
  if (f.kind === "assignee") {
    assignee.value = assignee.value === f.value ? "" : f.value;
    return;
  }
  toggleLabel(f.value);
}
const removeLabel = (title: string) => toggleLabel(title);
function clearFilters() {
  clearAll();
}

// Resolved label chips with color from the catalog (titles no longer carry color)
const labelChips = computed(() =>
  labelTitles.value.map((title) => ({
    title,
    color: labelCatalog.value.find((l) => l.title === title)?.color ?? "#888",
  })),
);

function loadMore() {
  if (hasNextPage.value && !isFetchingNextPage.value) fetchNextPage();
}
const sentinel = ref<HTMLElement | null>(null);
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting) loadMore();
});

// --- composer + new-issue highlight -----------------------------------------
const composerOpen = ref(false);
const highlightIid = ref<string | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | undefined;

function onCreated(iid: string) {
  highlightIid.value = iid;
  clearTimeout(highlightTimer);
  // Matches the 1.6s flash-in animation; clear so re-renders don't replay it.
  highlightTimer = setTimeout(() => (highlightIid.value = null), 1600);
}

onUnmounted(() => clearTimeout(highlightTimer));

// `C` opens the composer — but never while typing or with another surface open.
// Accept both cases so Caps Lock / Shift don't swallow the shortcut.
onKeyStroke(["c", "C"], (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable))
    return;
  if (composerOpen.value || openIid.value) return;
  e.preventDefault();
  composerOpen.value = true;
});
</script>

<template>
  <section class="space-y-5">
    <!-- Header -->
    <div class="flex items-end justify-between gap-4">
      <div class="min-w-0">
        <p
          class="font-mono text-[10px] font-medium tracking-[0.28em] text-muted-foreground/70 uppercase"
        >
          Issues
        </p>
        <h1
          class="vt-project-title mt-1 truncate text-2xl font-semibold tracking-tight text-foreground"
        >
          {{ repoName }}
        </h1>
        <p
          v-if="pathPrefix"
          class="truncate font-mono text-xs text-muted-foreground/75"
        >
          {{ pathPrefix }}/
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <Button data-testid="new-issue" @click="composerOpen = true">
          <Plus />
          New issue
        </Button>
        <div
          class="hidden shrink-0 flex-col items-end transition-opacity sm:flex"
          :class="isLoading ? 'opacity-0' : 'opacity-100'"
        >
          <span
            :key="count"
            class="animate-count inline-block font-mono text-[2rem] leading-none font-medium tabular-nums text-foreground"
          >
            {{ count
            }}<span v-if="hasMore" class="text-muted-foreground/40">+</span>
          </span>
          <span
            class="mt-1.5 text-[11px] tracking-wide text-muted-foreground/70 uppercase"
          >
            {{ count === 1 ? "issue" : "issues" }}
          </span>
        </div>
      </div>
    </div>

    <!-- Toolbar row 1: state · search · view -->
    <div class="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Filter issues by state"
        class="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
      >
        <button
          v-for="s in STATES"
          :key="s.value"
          type="button"
          :aria-pressed="state === s.value"
          class="rounded-[7px] px-3 py-1 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
          :class="
            state === s.value
              ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="state = s.value"
        >
          {{ s.label }}
        </button>
      </div>

      <div class="relative min-w-50 flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          v-model="search"
          type="search"
          placeholder="Search issues…"
          aria-label="Search issues"
          class="pl-9"
        />
      </div>

      <IssueFilterPanel
        v-model:labels="labelTitles"
        v-model:assignee="assignee"
        v-model:author="author"
        :catalog="labelCatalog"
        :members="members ?? []"
        :active-count="activeCount"
      />

      <!-- View toggle -->
      <div
        role="group"
        aria-label="Switch view"
        class="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
      >
        <button
          type="button"
          aria-label="List view"
          :aria-pressed="view === 'list'"
          class="grid size-7 place-items-center rounded-[7px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
          :class="
            view === 'list'
              ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="view = 'list'"
        >
          <List class="size-4" />
        </button>
        <button
          type="button"
          aria-label="Board view"
          :aria-pressed="view === 'board'"
          class="grid size-7 place-items-center rounded-[7px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
          :class="
            view === 'board'
              ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="view = 'board'"
        >
          <Columns3 class="size-4" />
        </button>
      </div>
    </div>

    <!-- Toolbar row 2: sort + group (list only) -->
    <div v-if="view === 'list'" class="flex flex-wrap items-center gap-2">
      <Select v-model="sortKey">
        <SelectTrigger class="h-8 w-44 text-xs" aria-label="Sort issues">
          <span class="text-muted-foreground">Sort</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in SORTS" :key="s.value" :value="s.value">
            {{ s.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="groupKey">
        <SelectTrigger class="h-8 w-44 text-xs" aria-label="Group issues">
          <span class="text-muted-foreground">Group</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="g in GROUPS" :key="g.value" :value="g.value">
            {{ g.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Toolbar row 2 (board): which scoped-label group becomes the columns -->
    <div
      v-else-if="scopeOptions.length"
      class="flex flex-wrap items-center gap-2"
    >
      <Select v-model="boardScope">
        <SelectTrigger class="h-8 w-52 text-xs" aria-label="Column grouping">
          <span class="text-muted-foreground">Columns by</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in scopeOptions" :key="s" :value="s">
            {{ s }}<span class="text-muted-foreground">::</span>
          </SelectItem>
        </SelectContent>
      </Select>
      <span class="text-xs text-muted-foreground/60">Drag cards to retag</span>
    </div>

    <!-- Active filter tokens -->
    <div v-if="activeCount" class="flex flex-wrap items-center gap-2">
      <span
        class="text-[11px] tracking-wide text-muted-foreground/60 uppercase"
      >
        Filtering
      </span>
      <LabelChip
        v-for="l in labelChips"
        :key="l.title"
        :title="l.title"
        :color="l.color"
        closeable
        @remove="removeLabel(l.title)"
      />
      <span
        v-if="assignee"
        class="inline-flex items-center gap-1 rounded-full bg-muted/60 py-0.5 pr-1 pl-2 text-[11px] font-medium text-foreground/80 ring-1 ring-inset ring-white/10"
      >
        <span class="font-mono">{{
          assignee === "__none__" ? "Unassigned" : "@" + assignee
        }}</span>
        <button
          type="button"
          aria-label="Remove assignee filter"
          class="grid size-4 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          @click="assignee = ''"
        >
          <X class="size-3" />
        </button>
      </span>
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
      <button
        type="button"
        class="text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:underline"
        @click="clearFilters"
      >
        Clear all
      </button>
    </div>

    <ErrorNotice v-if="error" :error="error" />

    <div
      v-else-if="isLoading"
      class="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div v-for="i in 6" :key="i" class="flex items-center gap-3 px-4 py-2">
        <Skeleton class="size-2 rounded-full" />
        <Skeleton class="size-5 rounded-md" />
        <Skeleton class="h-3.5 w-6" />
        <Skeleton
          class="h-3.5 flex-1"
          :style="{ maxWidth: `${40 + ((i * 13) % 45)}%` }"
        />
        <Skeleton class="h-5 w-16 rounded-full" />
      </div>
    </div>

    <template v-else>
      <template v-if="count">
        <!-- List view -->
        <div v-if="view === 'list'" class="space-y-5">
          <section v-for="g in listGroups" :key="g.key" class="space-y-2">
            <header
              v-if="groupKey !== 'none'"
              class="flex items-center gap-2 px-1"
            >
              <span
                v-if="g.color"
                class="size-2 rounded-full"
                :style="{ backgroundColor: g.color }"
              />
              <h2 class="text-sm font-medium text-foreground">{{ g.label }}</h2>
              <span
                class="font-mono text-xs tabular-nums text-muted-foreground/60"
              >
                {{ g.issues.length }}
              </span>
            </header>
            <Card
              class="gap-0 divide-y divide-border/60 overflow-hidden p-0 shadow-sm"
            >
              <IssueRow
                v-for="(issue, i) in g.issues"
                :key="issue.iid"
                :issue="issue"
                :full-path="fullPath"
                :index="i"
                :highlight="issue.iid === highlightIid"
                @filter="applyFacet"
              />
            </Card>
          </section>
        </div>

        <!-- Board view: full-bleed (breaks out of the centered column), bounded
             height, each column scrolls on its own, drag to retag. -->
        <div
          v-else
          class="relative left-1/2 flex h-[72vh] min-h-80 w-screen -translate-x-1/2 gap-3 overflow-x-auto px-6"
        >
          <section
            v-for="g in boardGroups"
            :key="g.key"
            class="flex h-full w-72 shrink-0 flex-col rounded-xl ring-1 ring-inset transition-colors duration-150"
            :class="
              dragOverKey === g.key
                ? 'bg-primary/6 ring-primary/40'
                : 'bg-card/40 ring-white/5'
            "
            @dragover.prevent="dragOverKey = g.key"
            @dragenter.prevent="dragOverKey = g.key"
            @drop.prevent="onDrop(g)"
          >
            <header class="flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-2">
              <span
                v-if="g.color"
                class="size-2 rounded-full"
                :style="{ backgroundColor: g.color }"
              />
              <h2 class="truncate text-sm font-medium text-foreground">
                {{ g.label }}
              </h2>
              <span
                class="ml-auto font-mono text-xs tabular-nums text-muted-foreground/60"
              >
                {{ g.issues.length }}
              </span>
            </header>
            <div
              class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-0.5 pb-2.5"
            >
              <div
                v-for="issue in g.issues"
                :key="issue.iid"
                draggable="true"
                class="group/card cursor-grab transition-opacity active:cursor-grabbing"
                :class="draggingIid === issue.iid ? 'opacity-40' : ''"
                @dragstart="onDragStart(issue, $event)"
                @dragend="clearDrag"
              >
                <IssueCard
                  :issue="issue"
                  :full-path="fullPath"
                  :highlight="issue.iid === highlightIid"
                  @filter="applyFacet"
                >
                  <GripVertical
                    class="size-3.5 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover/card:opacity-100"
                  />
                </IssueCard>
              </div>
            </div>
          </section>
        </div>

        <!-- Load more: auto-triggers via the sentinel, button is the fallback. -->
        <div v-if="hasMore" ref="sentinel" class="flex justify-center pt-1">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98] disabled:opacity-60"
            :disabled="isFetchingNextPage"
            @click="loadMore"
          >
            <LoaderCircle
              v-if="isFetchingNextPage"
              class="size-4 animate-spin text-primary"
            />
            {{ isFetchingNextPage ? "Loading…" : "Load more" }}
          </button>
        </div>
      </template>

      <!-- Empty state -->
      <div
        v-else
        class="flex animate-row-in flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center"
      >
        <div class="grid size-11 place-items-center rounded-full bg-muted">
          <Search class="size-5 text-muted-foreground" />
        </div>
        <p class="text-sm font-medium text-foreground">No issues.</p>
        <p class="max-w-xs text-xs text-muted-foreground">
          Nothing matches the current filters — adjust them above, or create
          one.
        </p>
        <Button
          data-testid="empty-new-issue"
          class="mt-1"
          @click="composerOpen = true"
        >
          <Plus />
          Create issue
        </Button>
      </div>
    </template>

    <IssueDrawer
      :open="!!openIid"
      :full-path="fullPath"
      :iid="openIid"
      @update:open="setDrawerOpen"
      @update:dirty="drawerDirty = $event"
      @expand="expandIssue"
    />

    <IssueComposer
      :open="composerOpen"
      :full-path="fullPath"
      @update:open="composerOpen = $event"
      @created="onCreated"
    />
  </section>
</template>
