<script setup lang="ts">
import { computed } from 'vue'
import {
  AlertOctagon,
  Zap,
  ArrowUpCircle,
  MinusCircle,
  ArrowDownCircle,
  Bug,
  Sparkles,
  Recycle,
  Plug,
  FlaskConical,
  Tag,
} from '@lucide/vue'
import LabelChip from './LabelChip.vue'
import StateBadge from './StateBadge.vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { priorityOf, typeOf, statusOf, remainingLabels, parseLabel, tint } from '@/lib/labels'
import type { Facet } from '@/lib/issueView'
import type { IssueListItem } from '@/composables/useIssues'

const props = defineProps<{
  issue: IssueListItem
  fullPath: string
  index?: number
  highlight?: boolean
}>()

const emit = defineEmits<{ filter: [facet: Facet] }>()

const ICONS = {
  AlertOctagon,
  Zap,
  ArrowUpCircle,
  MinusCircle,
  ArrowDownCircle,
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
  () => props.issue.assignees?.nodes?.filter((a): a is NonNullable<typeof a> => !!a) ?? [],
)

const priority = computed(() => priorityOf(labels.value))
const type = computed(() => typeOf(labels.value))
const status = computed(() => statusOf(labels.value))
const pills = computed(() => remainingLabels(labels.value))

// The raw label objects behind the lifted signals, so a facet click filters by
// the exact GitLab label (e.g. `priority::High`), not the display value.
const rawLabel = (scope: string) =>
  labels.value.find((l) => parseLabel(l.title, l.color).scope?.toLowerCase() === scope)
const priorityLabel = computed(() => rawLabel('priority'))
const typeLabel = computed(() => rawLabel('type'))

const shownAssignees = computed(() => assignees.value.slice(0, 3))
const extraAssignees = computed(() => Math.max(0, assignees.value.length - 3))

// For assignee avatars, we use the `name` initials as a fallback
const initials = (name: string) => {
  const parts = name.split(/[\s.-]+/)
  return parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)
}

const filterLabel = (l: { title: string; color: string }) =>
  emit('filter', { kind: 'label', value: l.title, color: l.color })
const filterAssignee = (username: string) => emit('filter', { kind: 'assignee', value: username })

// Cap the cascade so a long list doesn't drag the last rows in late.
const delay = computed(() => `${Math.min(props.index ?? 0, 14) * 26}ms`)
</script>

<template>
  <!-- Stretched-link row: the RouterLink is an overlay (keeps href / middle-click),
       facet buttons sit above it so clicking a label/priority/assignee filters
       instead of navigating. Avoids invalid <button>-inside-<a> nesting. -->
  <div
    class="group relative flex items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-accent/70 focus-within:bg-accent/70"
    :class="highlight ? 'animate-flash' : 'animate-row-in'"
    :style="{ animationDelay: delay }"
  >
    <RouterLink
      :to="{ query: { ...($route?.query ?? {}), issue: issue.iid } }"
      :aria-label="`Issue #${issue.iid}: ${issue.title}`"
      class="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
    />

    <StateBadge :state="issue.state" compact />

    <!-- Type glyph (filters by type::) -->
    <button
      v-if="type && typeLabel"
      type="button"
      :title="`Filter: ${type.label}`"
      class="relative z-10 grid size-5 shrink-0 cursor-pointer place-items-center rounded-md ring-1 ring-inset ring-white/10 outline-none transition-[scale] hover:ring-white/25 focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-90"
      :style="{ backgroundColor: tint(type.color, 0.18), color: type.color }"
      @click="filterLabel(typeLabel)"
    >
      <component :is="ICONS[type.icon]" class="size-3.5" :stroke-width="2.25" />
    </button>

    <!-- Priority glyph (filters by priority::) -->
    <button
      v-if="priority && priorityLabel"
      type="button"
      :title="`Filter: ${priority.label}`"
      class="relative z-10 grid size-5 shrink-0 cursor-pointer place-items-center rounded outline-none transition-[scale] focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-90"
      @click="filterLabel(priorityLabel)"
    >
      <component
        :is="ICONS[priority.icon]"
        class="size-3.5"
        :style="{ color: priority.color }"
        :stroke-width="2.75"
      />
    </button>

    <span class="shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70 w-6 text-right">
      <span class="text-muted-foreground/40">#</span>{{ issue.iid }}
    </span>

    <span
      class="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90 transition-colors group-hover:text-foreground"
    >
      {{ issue.title }}
    </span>

    <!-- Workflow status, lifted out of the label soup (filters by its label). -->
    <button
      v-if="status"
      type="button"
      :title="`Filter: ${status.value}`"
      class="relative z-10 hidden shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset ring-white/10 outline-none transition-[scale] hover:ring-white/25 focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95 sm:inline-flex"
      :style="{
        backgroundColor: tint(status.color, 0.18),
        color: status.color,
      }"
      @click="filterLabel({ title: status.raw, color: status.color })"
    >
      <span class="size-1.5 rounded-full" :style="{ backgroundColor: status.color }" />
      {{ status.value }}
    </button>

    <span v-if="pills.length" class="relative z-10 hidden shrink-0 gap-1 lg:flex">
      <button
        v-for="l in pills"
        :key="l.id"
        type="button"
        :title="`Filter: ${l.title}`"
        class="cursor-pointer rounded-full outline-none transition-[scale] focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95"
        @click="filterLabel(l)"
      >
        <LabelChip :title="l.title" :color="l.color" />
      </button>
    </span>

    <!-- Assignee avatars — click to filter by that assignee. -->
    <span v-if="shownAssignees.length" class="relative z-10 flex shrink-0 -space-x-1.5">
      <button
        v-for="a in shownAssignees"
        :key="a.id"
        type="button"
        :title="`Filter: ${a.username}`"
        class="cursor-pointer rounded-full outline-none transition-[scale] hover:z-10 focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-90"
        @click="filterAssignee(a.username)"
      >
        <Avatar class="size-6 ring-2 ring-card">
          <AvatarFallback class="bg-muted text-micro font-medium text-muted-foreground">
            {{ initials(a.name) }}
          </AvatarFallback>
        </Avatar>
      </button>
      <span
        v-if="extraAssignees"
        class="grid size-6 place-items-center rounded-full bg-muted text-micro font-medium text-muted-foreground ring-2 ring-card"
      >
        +{{ extraAssignees }}
      </span>
    </span>
  </div>
</template>
