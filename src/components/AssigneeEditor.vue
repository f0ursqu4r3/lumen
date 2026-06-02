<script setup lang="ts">
import { computed, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Check, UserPlus, X } from "@lucide/vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import AssigneeAvatar from "@/components/AssigneeAvatar.vue";
import {
  assigneeSections,
  personInitial,
  type OrderedPerson,
} from "@/lib/assigneeOrder";
import type { IssueDetail } from "@/composables/useIssue";
import type { ProjectMember } from "@/composables/useProjectMembers";

const props = defineProps<{
  issue: IssueDetail;
  members: ProjectMember[];
  usernames: string[];
}>();
const emit = defineEmits<{ "update:usernames": [usernames: string[]] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => (open.value = false));

const view = computed(() => assigneeSections(props.issue, props.members));
// Flat index so a username from the buffer resolves to a display name/avatar.
const peopleByUsername = computed(() => {
  const map = new Map<string, OrderedPerson>();
  for (const s of view.value.sections)
    for (const p of s.people) map.set(p.username, p);
  return map;
});
const currentRows = computed(() =>
  props.usernames.map(
    (u) =>
      peopleByUsername.value.get(u) ?? {
        username: u,
        name: null,
        avatarUrl: null,
      },
  ),
);

const isSelected = (u: string) => props.usernames.includes(u);
function removeOne(username: string) {
  emit(
    "update:usernames",
    props.usernames.filter((u) => u !== username),
  );
}
function toggle(username: string) {
  emit(
    "update:usernames",
    isSelected(username)
      ? props.usernames.filter((u) => u !== username)
      : [...props.usernames, username],
  );
}
</script>

<template>
  <div ref="root" class="space-y-2" @keydown.escape="open = false">
    <div v-if="currentRows.length" class="space-y-1">
      <div
        v-for="a in currentRows"
        :key="a.username"
        class="flex items-center gap-2"
      >
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

    <div class="relative">
      <button
        type="button"
        data-testid="assignee-add-trigger"
        :aria-expanded="open"
        aria-haspopup="menu"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        @click="open = !open"
      >
        <UserPlus class="size-3.5" />
        Add assignee
      </button>

      <div
        v-if="open"
        role="menu"
        aria-label="Add assignee"
        class="absolute z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
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
            :data-testid="`assignee-option-${p.username}`"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
            @click="toggle(p.username)"
          >
            <Avatar class="size-5 text-[10px]">
              <AvatarFallback>{{ personInitial(p) }}</AvatarFallback>
            </Avatar>
            <span class="min-w-0 flex-1 truncate text-foreground">
              {{ p.name || p.username }}
              <span class="text-muted-foreground">@{{ p.username }}</span>
            </span>
            <Check
              v-if="isSelected(p.username)"
              :data-testid="`assignee-checked-${p.username}`"
              class="size-3.5 shrink-0 text-primary"
            />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
