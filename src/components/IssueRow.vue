<script setup lang="ts">
import { computed } from 'vue'
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
} from '@lucide/vue'
import LabelChip from './LabelChip.vue'
import StateBadge from './StateBadge.vue'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { priorityOf, typeOf, statusOf, remainingLabels, tint } from '@/lib/labels'
import type { IssueListItem } from '@/composables/useIssues'

const props = defineProps<{
  issue: IssueListItem
  fullPath: string
  index?: number
}>()

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
} as const

const labels = computed(
  () => props.issue.labels?.nodes?.filter((l): l is NonNullable<typeof l> => !!l) ?? [],
)
const assignees = computed(
  () =>
    props.issue.assignees?.nodes?.filter((a): a is NonNullable<typeof a> => !!a) ?? [],
)

const priority = computed(() => priorityOf(labels.value))
const type = computed(() => typeOf(labels.value))
const status = computed(() => statusOf(labels.value))
const pills = computed(() => remainingLabels(labels.value))

const shownAssignees = computed(() => assignees.value.slice(0, 3))
const extraAssignees = computed(() => Math.max(0, assignees.value.length - 3))

const initials = (username: string) => username.slice(0, 2).toUpperCase()

// Cap the cascade so a long list doesn't drag the last rows in late.
const delay = computed(() => `${Math.min(props.index ?? 0, 14) * 26}ms`)
</script>

<template>
  <RouterLink
    :to="{ name: 'issue', params: { fullPath, iid: issue.iid } }"
    class="group relative flex animate-row-in items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-accent/60"
    :style="{ animationDelay: delay }"
  >
    <StateBadge :state="issue.state" compact />

    <!-- Type glyph -->
    <span
      v-if="type"
      :title="type.label"
      class="grid size-5 shrink-0 place-items-center rounded-md ring-1 ring-inset ring-white/5"
      :style="{ backgroundColor: tint(type.color, 0.18), color: type.color }"
    >
      <component :is="ICONS[type.icon]" class="size-3.5" :stroke-width="2.25" />
    </span>

    <span class="shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">
      {{ issue.iid }}
    </span>

    <!-- Priority as a leading caret (no side-stripe) — high/med/low read at a glance. -->
    <component
      :is="ICONS[priority.icon]"
      v-if="priority"
      :title="priority.label"
      class="size-3.5 shrink-0"
      :style="{ color: priority.color }"
      :stroke-width="2.75"
    />

    <span
      class="min-w-0 flex-1 truncate text-sm text-foreground/85 transition-colors group-hover:text-foreground"
    >
      {{ issue.title }}
    </span>

    <!-- Workflow status, lifted out of the label soup into its own chip. -->
    <span
      v-if="status"
      class="hidden shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-white/5 sm:inline-flex"
      :style="{ backgroundColor: tint(status.color, 0.18), color: status.color }"
    >
      <span class="size-1.5 rounded-full" :style="{ backgroundColor: status.color }" />
      {{ status.value }}
    </span>

    <span v-if="pills.length" class="hidden shrink-0 gap-1 lg:flex">
      <LabelChip v-for="l in pills" :key="l.id" :title="l.title" :color="l.color" />
    </span>

    <!-- Assignee avatars (data was already fetched, just never shown). -->
    <span v-if="shownAssignees.length" class="flex shrink-0 -space-x-1.5">
      <Avatar
        v-for="a in shownAssignees"
        :key="a.id"
        :title="a.username"
        class="size-6 ring-2 ring-card"
      >
        <AvatarImage v-if="a.avatarUrl" :src="a.avatarUrl" :alt="a.username" />
        <AvatarFallback class="bg-muted text-[10px] font-medium text-muted-foreground">
          {{ initials(a.username) }}
        </AvatarFallback>
      </Avatar>
      <span
        v-if="extraAssignees"
        class="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card"
      >
        +{{ extraAssignees }}
      </span>
    </span>
  </RouterLink>
</template>
