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
import LabelChip from '@/features/labels/components/LabelChip.vue'
import StateBadge from './StateBadge.vue'
import { Avatar, AvatarFallback } from '@/shared/ui/avatar'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  priorityOf,
  typeOf,
  statusOf,
  remainingLabels,
  parseLabel,
  tint,
  TERMINAL_PRIORITY,
  TERMINAL_TIER_CLASS,
} from '@/features/labels/lib/labels'
import { useIdiom } from '@/shared/theme/useIdiom'
import type { Facet } from '@/features/issues/lib/issueView'
import type { IssueListItem } from '@/features/issues/composables/useIssues'
import { useInjectedSelection } from '@/features/issues/composables/useIssueSelection'

const selection = useInjectedSelection()

// Terminal idiom (Phosphor): priority renders as repeated glyphs whose
// hierarchy is brightness, not semantic color.
const idiom = useIdiom()

// In select mode the whole row toggles selection; out of it, clicks fall through
// to the stretched RouterLink as before.
function onRowClick() {
  if (selection.mode.value) selection.toggle(props.issue.iid)
}

const props = defineProps<{
  issue: IssueListItem
  fullPath: string
  index?: number
  highlight?: boolean
  // When set, names this row for the View Transitions API so it morphs into the
  // matching board card (which carries the same name) on a list ⇄ board switch.
  vtName?: string
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
    data-testid="issue-row"
    class="group relative flex items-center gap-3 rounded-md border border-border/80 bg-secondary/60 px-4 shadow-card transition-colors duration-150 hover:bg-accent/70 focus-within:bg-accent/70"
    :class="[
      highlight ? 'animate-flash' : 'animate-row-in',
      selection.mode.value ? 'cursor-pointer select-none' : '',
    ]"
    :style="{
      animationDelay: delay,
      viewTransitionName: vtName,
      // density surface (Appearance ▸ Customize): row vertical padding scales with --density
      paddingBlock: 'var(--space-row-y)',
    }"
    @click="onRowClick"
  >
    <RouterLink
      v-if="!selection.mode.value"
      :to="{ query: { ...($route?.query ?? {}), issue: issue.iid } }"
      :aria-label="`Issue #${issue.iid}: ${issue.title}`"
      class="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
    />

    <Checkbox
      v-if="selection.mode.value"
      :model-value="selection.isSelected(issue.iid)"
      :aria-label="`Select issue #${issue.iid}`"
      class="relative z-10 shrink-0"
      @update:model-value="() => selection.toggle(issue.iid)"
      @click.stop
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
      <span
        v-if="idiom === 'terminal'"
        aria-hidden="true"
        class="font-mono text-2xs leading-none"
        :class="TERMINAL_TIER_CLASS[TERMINAL_PRIORITY[priority.level].tier]"
      >
        {{ TERMINAL_PRIORITY[priority.level].glyph }}
      </span>
      <component
        v-else
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
      class="relative z-10 hidden shrink-0 cursor-pointer items-center gap-1.5 rounded-[3px] px-2 py-0.5 font-mono text-micro font-medium tracking-[0.06em] uppercase ring-1 ring-inset ring-white/10 outline-none transition-[scale] hover:ring-white/25 focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95 sm:inline-flex"
      :class="idiom === 'terminal' && 'text-muted-foreground'"
      :style="
        idiom === 'terminal'
          ? undefined
          : { backgroundColor: tint(status.color, 0.18), color: status.color }
      "
      @click="filterLabel({ title: status.raw, color: status.color })"
    >
      <span
        v-if="idiom !== 'terminal'"
        class="size-1.5 rounded-full"
        :style="{ backgroundColor: status.color }"
      />
      <template v-if="idiom === 'terminal'">[{{ status.value.toUpperCase() }}]</template>
      <template v-else>{{ status.value }}</template>
    </button>

    <span v-if="pills.length" class="relative z-10 hidden shrink-0 gap-1 lg:flex">
      <button
        v-for="l in pills"
        :key="l.id"
        type="button"
        :title="`Filter: ${l.title}`"
        class="cursor-pointer rounded-[3px] outline-none transition-[scale] focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95"
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
          <AvatarFallback class="bg-muted text-muted-foreground">
            {{ initials(a.name) }}
          </AvatarFallback>
        </Avatar>
      </button>
      <Avatar v-if="extraAssignees" class="size-6 ring-2 ring-card">
        <AvatarFallback class="bg-muted text-muted-foreground">
          +{{ extraAssignees }}
        </AvatarFallback>
      </Avatar>
    </span>
  </div>
</template>
