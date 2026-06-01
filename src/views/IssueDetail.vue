<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useIssue } from '@/composables/useIssue'
import AssigneeAvatar from '@/components/AssigneeAvatar.vue'
import LabelChip from '@/components/LabelChip.vue'
import StateBadge from '@/components/StateBadge.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'

const props = defineProps<{ fullPath: string; iid: string }>()
const { data: issue, isLoading, error } = useIssue(toRef(props, 'fullPath'), toRef(props, 'iid'))

const labels = computed(
  () => issue.value?.labels?.nodes?.filter((l): l is NonNullable<typeof l> => !!l) ?? [],
)
const assignees = computed(
  () => issue.value?.assignees?.nodes?.filter((a): a is NonNullable<typeof a> => !!a) ?? [],
)
// User comments only — system notes ("changed milestone", "closed via …") are noise here.
const notes = computed(
  () => issue.value?.notes?.nodes?.filter((n): n is NonNullable<typeof n> => !!n && !n.system) ?? [],
)
</script>

<template>
  <ErrorNotice v-if="error" :error="error" />
  <p v-else-if="isLoading" class="text-sm text-neutral-500">Loading…</p>
  <article v-else-if="issue" class="space-y-4">
    <header class="flex items-center gap-2">
      <StateBadge :state="issue.state" />
      <h1 class="text-lg font-semibold">#{{ issue.iid }} {{ issue.title }}</h1>
    </header>
    <p v-if="issue.description" class="whitespace-pre-wrap text-sm">{{ issue.description }}</p>
    <div class="flex flex-wrap gap-2">
      <LabelChip v-for="l in labels" :key="l.id" :title="l.title" :color="l.color" />
    </div>
    <div class="flex flex-wrap gap-2">
      <AssigneeAvatar
        v-for="a in assignees"
        :key="a.id"
        :username="a.username"
        :avatar-url="a.avatarUrl"
      />
    </div>
    <p v-if="issue.milestone" class="text-xs text-neutral-500">
      Milestone: {{ issue.milestone.title }}
    </p>
    <section class="space-y-2">
      <h2 class="text-sm font-semibold">Notes</h2>
      <ul class="space-y-2">
        <li
          v-for="n in notes"
          :key="n.id"
          class="rounded border border-neutral-200 p-2 text-sm"
        >
          <span class="font-medium">@{{ n.author?.username }}</span>
          <span class="ml-2 text-xs text-neutral-400">{{ new Date(n.createdAt).toLocaleString() }}</span>
          <p class="mt-1 whitespace-pre-wrap">{{ n.body }}</p>
        </li>
      </ul>
    </section>
  </article>
</template>
