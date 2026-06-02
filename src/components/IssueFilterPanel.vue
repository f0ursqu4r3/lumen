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
