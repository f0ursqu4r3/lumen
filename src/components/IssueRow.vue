<script setup lang="ts">
import { computed } from 'vue';
import {
  ArrowUp,
  Equal,
  Minus,
  Bug,
  Sparkles,
  Recycle,
  Plug,
  FlaskConical,
  Tag,
} from '@lucide/vue';
import LabelChip from './LabelChip.vue';
import StateBadge from './StateBadge.vue';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  priorityOf,
  typeOf,
  statusOf,
  remainingLabels,
  tint,
} from '@/lib/labels';
import type { IssueListItem } from '@/composables/useIssues';

const props = defineProps<{ issue: IssueListItem; fullPath: string }>();

const ICONS = {
  'arrow-up': ArrowUp,
  equal: Equal,
  minus: Minus,
  bug: Bug,
  sparkles: Sparkles,
  recycle: Recycle,
  plug: Plug,
  'flask-conical': FlaskConical,
  tag: Tag,
} as const;

const labels = computed(
  () =>
    props.issue.labels?.nodes?.filter((l): l is NonNullable<typeof l> => !!l) ??
    []
);
const assignees = computed(
  () =>
    props.issue.assignees?.nodes?.filter(
      (a): a is NonNullable<typeof a> => !!a
    ) ?? []
);

const priority = computed(() => priorityOf(labels.value));
const type = computed(() => typeOf(labels.value));
const status = computed(() => statusOf(labels.value));
const pills = computed(() => remainingLabels(labels.value));

const shownAssignees = computed(() => assignees.value.slice(0, 3));
const extraAssignees = computed(() => Math.max(0, assignees.value.length - 3));

const initials = (username: string) => username.slice(0, 2).toUpperCase();
</script>

<template>
  <RouterLink
    :to="{ name: 'issue', params: { fullPath, iid: issue.iid } }"
    class="group relative flex items-center gap-3 py-2.5 pr-4 pl-5 transition-colors hover:bg-neutral-50"
  >
    <!-- Priority rail: instant left-edge scan cue, color by urgency. -->
    <span
      class="absolute inset-y-0 left-0 w-0.75 transition-all group-hover:w-1"
      :style="{ backgroundColor: priority ? priority.color : 'transparent' }"
    />

    <StateBadge :state="issue.state" compact />

    <!-- Type glyph -->
    <span
      v-if="type"
      :title="type.label"
      class="grid size-5 shrink-0 place-items-center rounded-md"
      :style="{ backgroundColor: tint(type.color, 0.16), color: type.color }"
    >
      <component :is="ICONS[type.icon]" class="size-3.5" :stroke-width="2.25" />
    </span>

    <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-400">
      #{{ issue.iid }}
    </span>

    <!-- Priority chevron sits just before the title for high/med items. -->
    <component
      :is="ICONS[priority.icon]"
      v-if="priority"
      :title="priority.label"
      class="size-3.5 shrink-0"
      :style="{ color: priority.color }"
      :stroke-width="2.75"
    />

    <span
      class="min-w-0 flex-1 truncate text-sm text-neutral-800 group-hover:text-neutral-950"
    >
      {{ issue.title }}
    </span>

    <!-- Workflow status, lifted out of the label soup into its own chip. -->
    <span
      v-if="status"
      class="hidden shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex"
      :style="{
        backgroundColor: tint(status.color, 0.16),
        color: status.color,
      }"
    >
      <span
        class="size-1.5 rounded-full"
        :style="{ backgroundColor: status.color }"
      />
      {{ status.value }}
    </span>

    <span v-if="pills.length" class="hidden shrink-0 gap-1 lg:flex">
      <LabelChip
        v-for="l in pills"
        :key="l.id"
        :title="l.title"
        :color="l.color"
      />
    </span>

    <!-- Assignee avatars (data was already fetched, just never shown). -->
    <span v-if="shownAssignees.length" class="flex shrink-0 -space-x-1.5">
      <Avatar
        v-for="a in shownAssignees"
        :key="a.id"
        :title="a.username"
        class="size-6 ring-2 ring-white"
      >
        <AvatarImage v-if="a.avatarUrl" :src="a.avatarUrl" :alt="a.username" />
        <AvatarFallback
          class="bg-neutral-200 text-[10px] font-medium text-neutral-600"
        >
          {{ initials(a.username) }}
        </AvatarFallback>
      </Avatar>
      <span
        v-if="extraAssignees"
        class="grid size-6 place-items-center rounded-full bg-neutral-100 text-[10px] font-medium text-neutral-500 ring-2 ring-white"
      >
        +{{ extraAssignees }}
      </span>
    </span>
  </RouterLink>
</template>
