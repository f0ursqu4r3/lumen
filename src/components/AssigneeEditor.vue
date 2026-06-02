<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Check, UserPlus, X } from "@lucide/vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import AssigneeAvatar from "@/components/AssigneeAvatar.vue";
import { useSetAssignees } from "@/composables/useIssueMutations";
import { assigneeSections } from "@/lib/assigneeOrder";
import type { GitLabError } from "@/gitlab/errors";
import type { IssueDetail } from "@/composables/useIssue";
import type { ProjectMember } from "@/composables/useProjectMembers";

const props = defineProps<{
  fullPath: string;
  iid: string;
  issue: IssueDetail;
  members: ProjectMember[];
}>();
const emit = defineEmits<{ error: [GitLabError | null] }>();

// fullPath/iid are captured once; mounts per issue route, so props are stable.
const set = useSetAssignees(props.fullPath, props.iid);
// No error UI of its own; bubble mutation failures up to IssueDetail's ErrorNotice.
watch(
  () => set.error.value,
  (e) => emit("error", e),
);

const open = ref(false);
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => (open.value = false));

const view = computed(() => assigneeSections(props.issue, props.members));

// Local working list so rapid multi-selects stay additive before the issue
// refetches; re-synced whenever the server view changes. Display (rows + ✓)
// stays prop-derived, matching the no-optimistic-patching idiom elsewhere.
const pendingUsernames = ref<string[]>(
  view.value.assignees.map((a) => a.username),
);
watch(
  () => view.value.assignees,
  (assignees) => {
    pendingUsernames.value = assignees.map((a) => a.username);
  },
);

const initial = (p: { name?: string | null; username: string }) =>
  (p.name || p.username).charAt(0).toUpperCase();

function removeOne(username: string) {
  const next = pendingUsernames.value.filter((u) => u !== username);
  pendingUsernames.value = next;
  set.mutate({ assigneeUsernames: next });
}
// Additive toggle: clicking a member adds them, clicking an assigned one removes
// them. REPLACE semantics over the local working list.
function toggle(username: string) {
  const next = pendingUsernames.value.includes(username)
    ? pendingUsernames.value.filter((u) => u !== username)
    : [...pendingUsernames.value, username];
  pendingUsernames.value = next;
  set.mutate({ assigneeUsernames: next });
}
</script>

<template>
  <div ref="root" class="space-y-2" @keydown.escape="open = false">
    <div v-if="view.assignees.length" class="space-y-1">
      <div
        v-for="a in view.assignees"
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
        :disabled="set.isPending.value"
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
              <AvatarFallback>{{ initial(p) }}</AvatarFallback>
            </Avatar>
            <span class="min-w-0 flex-1 truncate text-foreground">
              {{ p.name || p.username }}
              <span class="text-muted-foreground">@{{ p.username }}</span>
            </span>
            <Check v-if="p.isAssigned" class="size-3.5 shrink-0 text-primary" />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
