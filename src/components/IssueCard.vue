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
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { priorityOf, typeOf, parseLabel, tint } from '@/lib/labels'
import type { Facet } from '@/lib/issueView'
import type { IssueListItem } from '@/composables/useIssues'

const props = defineProps<{ issue: IssueListItem; fullPath: string }>()
const emit = defineEmits<{ filter: [facet: Facet] }>()

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
const priorityLabel = computed(() =>
  labels.value.find((l) => parseLabel(l.title, l.color).scope?.toLowerCase() === 'priority'),
)

const shownAssignees = computed(() => assignees.value.slice(0, 3))
const extraAssignees = computed(() => Math.max(0, assignees.value.length - 3))
const initials = (u: string) => u.slice(0, 2).toUpperCase()

const filterLabel = (l: { title: string; color: string }) =>
  emit('filter', { kind: 'label', value: l.title, color: l.color })
const filterAssignee = (u: string) => emit('filter', { kind: 'assignee', value: u })
</script>

<template>
  <div
    class="group relative flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 transition-colors duration-150 hover:border-border/0 hover:bg-accent/50 focus-within:bg-accent/50"
  >
    <RouterLink
      :to="{ name: 'issue', params: { fullPath, iid: issue.iid } }"
      :aria-label="`Issue #${issue.iid}: ${issue.title}`"
      draggable="false"
      class="absolute inset-0 rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
    />

    <p
      class="line-clamp-2 text-sm leading-snug text-foreground/90 transition-colors group-hover:text-foreground"
    >
      {{ issue.title }}
    </p>

    <div class="flex items-center gap-2">
      <!-- Optional drag handle (board view passes a grip icon here). -->
      <slot />
      <button
        v-if="type"
        type="button"
        :title="type.label"
        class="relative z-10 grid size-5 shrink-0 cursor-pointer place-items-center rounded-md ring-1 ring-inset ring-white/10 outline-none transition-[scale] hover:ring-white/25 focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-90"
        :style="{ backgroundColor: tint(type.color, 0.18), color: type.color }"
        @click="filterLabel({ title: `type::${type.code}`, color: type.color })"
      >
        <component :is="ICONS[type.icon]" class="size-3" :stroke-width="2.25" />
      </button>

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

      <span class="font-mono text-[11px] tabular-nums text-muted-foreground/60">
        <span class="text-muted-foreground/35">#</span>{{ issue.iid }}
      </span>

      <span v-if="shownAssignees.length" class="relative z-10 ml-auto flex -space-x-1.5">
        <button
          v-for="a in shownAssignees"
          :key="a.id"
          type="button"
          :title="`Filter: ${a.username}`"
          class="cursor-pointer rounded-full outline-none transition-[scale] hover:z-10 focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-90"
          @click="filterAssignee(a.username)"
        >
          <Avatar class="size-5 ring-2 ring-card">
            <AvatarImage v-if="a.avatarUrl" :src="a.avatarUrl" :alt="a.username" />
            <AvatarFallback class="bg-muted text-[9px] font-medium text-muted-foreground">
              {{ initials(a.username) }}
            </AvatarFallback>
          </Avatar>
        </button>
        <span
          v-if="extraAssignees"
          class="grid size-5 place-items-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-2 ring-card"
        >
          +{{ extraAssignees }}
        </span>
      </span>
    </div>
  </div>
</template>
