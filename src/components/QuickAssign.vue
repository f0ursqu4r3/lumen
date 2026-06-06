<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { UserStar } from '@lucide/vue'
import AssigneeMenu from '@/components/AssigneeMenu.vue'
import { assigneeSections } from '@/lib/assigneeOrder'
import type { IssueDetail } from '@/features/issues/composables/useIssue'
import type { ProjectMember } from '@/composables/useProjectMembers'
import type { ProjectContributor } from '@/composables/useProjectContributors'

const props = withDefaults(
  defineProps<{
    issue: IssueDetail
    members: ProjectMember[]
    contributors?: ProjectContributor[]
    usernames: string[]
  }>(),
  { contributors: () => [] },
)
const emit = defineEmits<{ 'update:usernames': [usernames: string[]] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (open.value = false))

const view = computed(() => assigneeSections(props.issue, props.members, props.contributors))

// Quick assign replaces the whole assignee set with the chosen person.
function assignOnly(username: string) {
  emit('update:usernames', [username])
  open.value = false
}
</script>

<template>
  <div ref="root" class="relative" @keydown.escape="open = false">
    <button
      type="button"
      :aria-expanded="open"
      aria-haspopup="menu"
      data-testid="quick-assign-trigger"
      class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      @click="open = !open"
    >
      <UserStar class="size-3.5" />
      Quick
    </button>

    <AssigneeMenu
      v-if="open"
      :sections="view.sections"
      :selected="usernames"
      menu-label="Quick assign"
      testid-prefix="quick-assign"
      @select="assignOnly"
    />
  </div>
</template>
