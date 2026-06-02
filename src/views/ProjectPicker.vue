<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import { useTitle, useIntersectionObserver } from "@vueuse/core";
import { Search, CornerDownLeft, FolderGit2, LoaderCircle } from "@lucide/vue";
import { useProjects, type ProjectSummary } from "@/composables/useProjects";
import ErrorNotice from "@/components/ErrorNotice.vue";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

useTitle("Projects · lumen");

const router = useRouter();

const search = ref("");
const {
  projects,
  isLoading,
  error,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
} = useProjects(search);
const count = computed(() => projects.value.length);
const hasMore = computed(() => hasNextPage.value ?? false);

// Split each path so the repo (final segment) reads as the name and the rest
// trails as muted mono context — same emphasis the issues header uses.
const namespace = (fullPath: string) => {
  const parts = fullPath.split("/");
  return parts.slice(0, -1).join("/");
};

// --- selection cursor -------------------------------------------------------
// The picker is a launcher first, a list second: a selection glides on the
// keyboard like a command palette. `active` is the logical cursor; the amber
// rail (`cursor`) chases it with a critically-damped spring so it has weight
// without the tackiness of a bounce.
const active = ref(0);
const listEl = ref<HTMLElement | null>(null);
const reduce =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : null;

const cursor = reactive({ y: 0, h: 0, visible: false });
let velocity = 0;
let raf = 0;
let lastTs = 0;

const rowAt = (i: number) =>
  listEl.value?.querySelectorAll<HTMLElement>("[data-row]")[i] ?? null;

function springTo(snap = false) {
  const el = rowAt(active.value);
  if (!el) {
    cursor.visible = false;
    return;
  }
  cursor.visible = true;
  cursor.h = el.offsetHeight;
  const target = el.offsetTop;
  cancelAnimationFrame(raf);

  if (snap || reduce?.matches) {
    cursor.y = target;
    velocity = 0;
    return;
  }

  lastTs = performance.now();
  const step = (now: number) => {
    const dt = Math.min((now - lastTs) / 1000, 1 / 30);
    lastTs = now;
    // stiffness/damping tuned just past critical: snappy arrival, no overshoot.
    const accel = -210 * (cursor.y - target) - 30 * velocity;
    velocity += accel * dt;
    cursor.y += velocity * dt;
    if (Math.abs(cursor.y - target) < 0.3 && Math.abs(velocity) < 0.3) {
      cursor.y = target;
      velocity = 0;
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

function move(delta: number) {
  if (!count.value) return;
  active.value = Math.max(0, Math.min(count.value - 1, active.value + delta));
  rowAt(active.value)?.scrollIntoView({ block: "nearest" });
}

// Glide whenever the cursor target changes.
watch(active, () => springTo());

// A new search is a new context — reset to the top and snap (no glide across a
// list that just changed underneath). Appended pages must NOT reset the cursor.
watch(search, () => {
  active.value = 0;
  nextTick(() => springTo(true));
});

// First data, or appended pages: keep `active` in range and (re)place the rail.
watch(
  () => count.value,
  (n, prev) => {
    if (active.value > n - 1) active.value = Math.max(0, n - 1);
    nextTick(() => springTo(prev === 0));
  },
);

// --- launch + morph ---------------------------------------------------------
// Launching morphs the chosen project's name into the issues header via a View
// Transition, so the picker → issues handoff reads as one instrument retuning
// rather than a page swap. Degrades to a plain push where VT is unavailable or
// motion is reduced.
const morphingId = ref<string | null>(null);
const nameStyle = (p: ProjectSummary) =>
  p.id === morphingId.value
    ? { viewTransitionName: "project-title" }
    : undefined;

function navigate(p: ProjectSummary) {
  return router.push({ name: "issues", params: { fullPath: p.fullPath } });
}

async function launch(p: ProjectSummary, i: number) {
  active.value = i;
  const canMorph =
    typeof document.startViewTransition === "function" && !reduce?.matches;
  if (!canMorph) {
    navigate(p);
    return;
  }
  morphingId.value = p.id;
  await nextTick(); // ensure the name carries the transition-name before snapshot
  document.startViewTransition(async () => {
    await navigate(p);
    await nextTick();
  });
}

function onRowClick(e: MouseEvent, p: ProjectSummary, i: number) {
  // Let the browser handle modified clicks (open in new tab) via the real href.
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  launch(p, i);
}

// --- keyboard ---------------------------------------------------------------
const searchInput = ref<{ $el?: HTMLElement } | null>(null);
const focusSearch = () => searchInput.value?.$el?.focus?.();
const searchFocused = () =>
  !!searchInput.value?.$el && document.activeElement === searchInput.value.$el;

function onKeydown(e: KeyboardEvent) {
  // ⌘1–9 (or Ctrl): jump straight to a project and launch it, from anywhere.
  if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
    const i = Number(e.key) - 1;
    const p = projects.value[i];
    if (p) {
      e.preventDefault();
      launch(p, i);
    }
    return;
  }

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      move(1);
      return;
    case "ArrowUp":
      e.preventDefault();
      move(-1);
      return;
    case "Enter": {
      const p = projects.value[active.value];
      if (p) {
        e.preventDefault();
        launch(p, active.value);
      }
      return;
    }
    case "Escape":
      if (search.value) {
        search.value = "";
      } else {
        searchInput.value?.$el?.blur?.();
      }
      return;
  }

  if (searchFocused()) {
    // j/k are nav only when not typing into the field.
    return;
  }

  if (e.key === "j") {
    e.preventDefault();
    move(1);
  } else if (e.key === "k") {
    e.preventDefault();
    move(-1);
  } else if (
    e.key.length === 1 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey
  ) {
    // Type-to-filter from anywhere: focus the field and let the keypress land.
    focusSearch();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  nextTick(() => springTo(true));
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  cancelAnimationFrame(raf);
});

// --- infinite load ----------------------------------------------------------
function loadMore() {
  if (hasNextPage.value && !isFetchingNextPage.value) fetchNextPage();
}
const sentinel = ref<HTMLElement | null>(null);
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting) loadMore();
});
</script>

<template>
  <section class="space-y-5">
    <!-- Header — mirrors the issues view so the entry feels of a piece. -->
    <div class="flex items-end justify-between gap-4">
      <div class="min-w-0">
        <p
          class="font-mono text-[10px] font-medium tracking-[0.28em] text-muted-foreground/70 uppercase"
        >
          Workspace
        </p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Projects
        </h1>
      </div>
      <div
        v-if="!isLoading && !error"
        class="hidden shrink-0 flex-col items-end sm:flex"
      >
        <span
          :key="count"
          class="animate-count inline-block font-mono text-[2rem] leading-none font-medium tabular-nums text-foreground"
        >
          {{ count }}
        </span>
        <span
          class="mt-1.5 text-[11px] tracking-wide text-muted-foreground/70 uppercase"
        >
          {{ count === 1 ? "project" : "projects" }}{{ hasMore ? "+" : "" }}
        </span>
      </div>
    </div>

    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref="searchInput"
        v-model="search"
        type="search"
        placeholder="Search projects…"
        aria-label="Search projects"
        class="pl-9"
      />
    </div>

    <ErrorNotice v-if="error" :error="error" />

    <div
      v-else-if="isLoading"
      class="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div v-for="i in 6" :key="i" class="flex items-center gap-3 px-4 py-3">
        <Skeleton class="size-4 rounded-md" />
        <Skeleton class="h-3.5" :style="{ width: `${30 + ((i * 17) % 40)}%` }" />
        <Skeleton class="h-3 w-24" />
      </div>
    </div>

    <template v-else>
      <Card
        v-if="count"
        class="relative gap-0 overflow-hidden p-0 shadow-sm"
        role="listbox"
        aria-label="Projects"
      >
        <!-- The amber rail: one element that glides between rows on a spring. -->
        <div
          class="pointer-events-none absolute inset-x-1 top-0 z-0 rounded-lg bg-accent ring-1 ring-inset ring-border transition-[height,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]"
          :style="{
            transform: `translateY(${cursor.y}px)`,
            height: `${cursor.h}px`,
            opacity: cursor.visible ? 1 : 0,
          }"
        >
          <span
            class="absolute top-1/2 left-2.5 size-1.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_1px] shadow-primary/50"
          />
        </div>

        <RouterLink
          v-for="(p, i) in projects"
          :key="p.id"
          data-row
          role="option"
          :aria-selected="i === active"
          :to="{ name: 'issues', params: { fullPath: p.fullPath } }"
          class="group relative z-10 flex animate-row-in items-baseline gap-2.5 rounded-lg py-3 pr-4 pl-7 outline-none"
          :style="{ animationDelay: `${Math.min(i, 14) * 26}ms` }"
          @mouseenter="active = i"
          @click="onRowClick($event, p, i)"
          @focus="active = i"
        >
          <span
            class="text-sm font-medium transition-colors"
            :class="
              i === active ? 'text-foreground' : 'text-foreground/90'
            "
            :style="nameStyle(p)"
          >
            {{ p.name }}
          </span>
          <span
            v-if="namespace(p.fullPath)"
            class="truncate font-mono text-xs text-muted-foreground/60"
          >
            {{ namespace(p.fullPath) }}/
          </span>

          <!-- Right cluster: an Enter affordance on the active row, then the
               quick-jump index for the first nine projects. -->
          <span
            class="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums"
          >
            <CornerDownLeft
              class="size-3.5 text-primary transition-opacity duration-150"
              :class="i === active ? 'opacity-100' : 'opacity-0'"
            />
            <span
              v-if="i < 9"
              class="transition-colors"
              :class="
                i === active
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/40'
              "
            >
              {{ i + 1 }}
            </span>
          </span>
        </RouterLink>

        <!-- Load more: the sentinel auto-fetches; the row also reports state. -->
        <div
          v-if="hasMore"
          ref="sentinel"
          class="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"
        >
          <LoaderCircle v-if="isFetchingNextPage" class="size-3.5 animate-spin" />
          <span>{{ isFetchingNextPage ? "Loading…" : "Scroll for more" }}</span>
        </div>
      </Card>

      <!-- Teaching empty state — distinguishes "no match" from "nothing here yet". -->
      <div
        v-else
        class="flex animate-row-in flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center"
      >
        <div class="grid size-11 place-items-center rounded-full bg-muted">
          <component
            :is="search ? Search : FolderGit2"
            class="size-5 text-muted-foreground"
          />
        </div>
        <p class="text-sm font-medium text-foreground">
          {{ search ? "No matches." : "No projects." }}
        </p>
        <p class="max-w-xs text-xs text-muted-foreground">
          {{
            search
              ? `Nothing matches “${search}”. Try a different term.`
              : "Projects from your GitLab instance will appear here as you gain access."
          }}
        </p>
      </div>

      <!-- Keyboard legend — the launcher tells you how to fly it. -->
      <div
        v-if="count"
        class="hidden items-center gap-x-4 gap-y-1 px-1 font-mono text-[11px] text-muted-foreground/60 select-none sm:flex sm:flex-wrap"
      >
        <span><kbd class="text-muted-foreground/80">type</kbd> filter</span>
        <span><kbd class="text-muted-foreground/80">↑↓</kbd> move</span>
        <span><kbd class="text-muted-foreground/80">⏎</kbd> open</span>
        <span><kbd class="text-muted-foreground/80">⌘1–9</kbd> jump</span>
      </div>
    </template>
  </section>
</template>
