<script setup lang="ts">
import { computed, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { Search, ArrowRight, FolderGit2 } from "@lucide/vue";
import { useProjects } from "@/composables/useProjects";
import ErrorNotice from "@/components/ErrorNotice.vue";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

useTitle("Projects · tragit");

const search = ref("");
const { data: projects, isLoading, error } = useProjects(search);
const count = computed(() => projects.value?.length ?? 0);

// Split each path so the repo (final segment) reads as the name and the rest
// trails as muted mono context — same emphasis the issues header uses.
const namespace = (fullPath: string) => {
  const parts = fullPath.split("/");
  return parts.slice(0, -1).join("/");
};
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
          {{ count === 1 ? "project" : "projects" }}
        </span>
      </div>
    </div>

    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
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
      <div v-for="i in 5" :key="i" class="flex items-center gap-3 px-4 py-3">
        <Skeleton class="size-4 rounded-md" />
        <Skeleton
          class="h-3.5"
          :style="{ width: `${30 + ((i * 17) % 40)}%` }"
        />
        <Skeleton class="h-3 w-24" />
      </div>
    </div>

    <template v-else>
      <Card
        v-if="count"
        class="gap-0 divide-y divide-border/60 overflow-hidden p-0 shadow-sm"
      >
        <RouterLink
          v-for="(p, i) in projects"
          :key="p.id"
          :to="{ name: 'issues', params: { fullPath: p.fullPath } }"
          class="group flex animate-row-in items-baseline gap-2.5 px-4 py-3 transition-colors duration-150 outline-none hover:bg-accent/60 focus-visible:bg-accent/60"
          :style="{ animationDelay: `${Math.min(i, 14) * 26}ms` }"
        >
          <span
            class="text-sm font-medium text-foreground/90 transition-colors group-hover:text-foreground"
          >
            {{ p.name }}
          </span>
          <span
            v-if="namespace(p.fullPath)"
            class="truncate font-mono text-xs text-muted-foreground/60"
          >
            {{ namespace(p.fullPath) }}/
          </span>
          <!-- A directional nudge that wakes up on hover — invites the click. -->
          <ArrowRight
            class="ml-auto size-4 shrink-0 -translate-x-1 text-muted-foreground/0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-muted-foreground group-focus-visible:translate-x-0 group-focus-visible:text-muted-foreground"
          />
        </RouterLink>
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
    </template>
  </section>
</template>
