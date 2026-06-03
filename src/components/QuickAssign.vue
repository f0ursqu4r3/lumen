<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Check, UserStar } from '@lucide/vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { assigneeSections, personInitial } from '@/lib/assigneeOrder'
import type { IssueDetail } from '@/composables/useIssue'
import type { ProjectMember } from '@/composables/useProjectMembers'

const props = defineProps<{
  issue: IssueDetail
  members: ProjectMember[]
  usernames: string[]
}>()
const emit = defineEmits<{ 'update:usernames': [usernames: string[]] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (open.value = false))

const view = computed(() => assigneeSections(props.issue, props.members))

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
      Quick assign
    </button>

    <div
      v-if="open"
      role="menu"
      aria-label="Quick assign"
      class="absolute right-0 z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      <template v-for="section in view.sections" :key="section.rel">
        <p
          role="presentation"
          class="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {{ section.label }}
        </p>
        <button
          v-for="p in section.people"
          :key="p.username"
          type="button"
          role="menuitem"
          :data-testid="`quick-assign-option-${p.username}`"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
          @click="assignOnly(p.username)"
        >
          <Avatar class="size-5 text-[10px]">
            <AvatarFallback>{{ personInitial(p) }}</AvatarFallback>
          </Avatar>
          <span class="min-w-0 flex-1 truncate text-foreground">
            {{ p.name || p.username }}
            <span class="text-muted-foreground">@{{ p.username }}</span>
          </span>
          <Check v-if="usernames.includes(p.username)" class="size-3.5 shrink-0 text-primary" />
        </button>
      </template>
    </div>
  </div>
</template>
