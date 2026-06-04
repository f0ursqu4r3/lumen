<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { UserPen, X } from '@lucide/vue'
import AssigneeAvatar from '@/components/AssigneeAvatar.vue'
import AssigneeMenu from '@/components/AssigneeMenu.vue'
import { assigneeSections, type OrderedPerson } from '@/lib/assigneeOrder'
import type { IssueDetail } from '@/composables/useIssue'
import type { ProjectMember } from '@/composables/useProjectMembers'
import type { ProjectContributor } from '@/composables/useProjectContributors'

const props = withDefaults(
  defineProps<{
    issue: IssueDetail
    members: ProjectMember[]
    contributors?: ProjectContributor[]
    usernames: string[]
    label?: string
  }>(),
  { label: 'Assignees', contributors: () => [] },
)
const emit = defineEmits<{ 'update:usernames': [usernames: string[]] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (open.value = false))

const view = computed(() => assigneeSections(props.issue, props.members, props.contributors))
// Flat index so a username from the buffer resolves to a display name/avatar.
const peopleByUsername = computed(() => {
  const map = new Map<string, OrderedPerson>()
  for (const s of view.value.sections) for (const p of s.people) map.set(p.username, p)
  return map
})
const currentRows = computed(() =>
  props.usernames.map(
    (u) =>
      peopleByUsername.value.get(u) ?? {
        username: u,
        name: null,
        avatarUrl: null,
      },
  ),
)

const isSelected = (u: string) => props.usernames.includes(u)
function removeOne(username: string) {
  emit(
    'update:usernames',
    props.usernames.filter((u) => u !== username),
  )
}
function toggle(username: string) {
  emit(
    'update:usernames',
    isSelected(username)
      ? props.usernames.filter((u) => u !== username)
      : [...props.usernames, username],
  )
}
</script>

<template>
  <div ref="root" class="space-y-2" @keydown.escape="open = false">
    <div class="flex items-center justify-between gap-2">
      <span class="field-label">{{ label }}</span>
      <div class="flex items-center gap-1.5">
        <div class="relative">
          <button
            type="button"
            data-testid="assignee-add-trigger"
            :aria-expanded="open"
            aria-haspopup="menu"
            class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            @click="open = !open"
          >
            <UserPen class="size-3.5" />
            Assign
          </button>

          <AssigneeMenu
            v-if="open"
            :sections="view.sections"
            :selected="usernames"
            menu-label="Add assignee"
            testid-prefix="assignee"
            @select="toggle"
          />
        </div>
        <slot name="actions" />
      </div>
    </div>

    <div v-if="currentRows.length" class="space-y-1">
      <div v-for="a in currentRows" :key="a.username" class="flex items-center gap-2">
        <AssigneeAvatar
          :name="a.name || a.username"
          :username="a.username"
          :avatar-url="a.avatarUrl"
        />
        <button
          type="button"
          :data-testid="`assignee-remove-${a.username}`"
          class="rounded p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
          :aria-label="`Remove ${a.name || a.username} as assignee`"
          @click="removeOne(a.username)"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
