<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Check, UserPlus, X } from "@lucide/vue";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSetAssignees } from "@/composables/useIssueMutations";
import { orderAssignees, type Relationship } from "@/lib/assigneeOrder";
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

// fullPath/iid are captured once; QuickAssign mounts per issue route, so the
// props are stable for its lifetime (same assumption as IssueDetail's useUpdateIssue).
const assign = useSetAssignees(props.fullPath, props.iid);
// QuickAssign has no error UI of its own; bubble mutation failures (and their
// clearing, on the next successful mutate) up to IssueDetail's ErrorNotice.
watch(
  () => assign.error.value,
  (e) => emit("error", e),
);

const open = ref(false);
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => (open.value = false));

const assignees = computed(() =>
  (props.issue.assignees?.nodes ?? []).filter(
    (a): a is NonNullable<typeof a> => !!a,
  ),
);

// Distinct, most-recent-first comment authors; system notes excluded.
const noteAuthors = computed(() =>
  (props.issue.notes?.nodes ?? [])
    .filter((n): n is NonNullable<typeof n> => !!n && !n.system && !!n.author)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((n) => n.author!),
);

const ordered = computed(() =>
  orderAssignees({
    author: props.issue.author ?? null,
    assignees: assignees.value,
    noteAuthors: noteAuthors.value,
    members: props.members,
  }),
);

const SECTION_LABEL: Record<Relationship, string> = {
  originator: "Reporter",
  assignee: "Assigned",
  commenter: "Commented",
  member: "Project members",
};
const ORDER: Relationship[] = ["originator", "assignee", "commenter", "member"];
const sections = computed(() =>
  ORDER.map((rel) => ({
    rel,
    label: SECTION_LABEL[rel],
    people: ordered.value.filter((p) => p.relationship === rel),
  })).filter((s) => s.people.length),
);

const initial = (p: { name?: string | null; username: string }) =>
  (p.name || p.username).charAt(0).toUpperCase();

function assignOnly(username: string) {
  assign.mutate({ assigneeUsernames: [username] });
  open.value = false;
}
// Unlike assignOnly/unassignAll, this leaves the menu open so several
// assignees can be trimmed in a row; the row disappears once the issue refetches.
function removeOne(username: string) {
  assign.mutate({
    assigneeUsernames: assignees.value
      .map((a) => a.username)
      .filter((u) => u !== username),
  });
}
function unassignAll() {
  assign.mutate({ assigneeUsernames: [] });
  open.value = false;
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
      :disabled="assign.isPending.value"
      @click="open = !open"
    >
      <UserPlus class="size-3.5" />
      <template v-if="assignees.length">
        <Avatar v-for="a in assignees" :key="a.id" class="size-5 text-[10px]">
          <AvatarFallback>{{ initial(a) }}</AvatarFallback>
        </Avatar>
      </template>
      <span v-else>Assign</span>
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      <button
        v-if="assignees.length"
        type="button"
        data-testid="quick-assign-unassign-all"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-accent focus-visible:bg-accent"
        @click="unassignAll"
      >
        <X class="size-3.5" />Unassign all
      </button>

      <template v-for="section in sections" :key="section.rel">
        <p
          class="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {{ section.label }}
        </p>
        <div
          v-for="p in section.people"
          :key="p.username"
          class="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
        >
          <button
            type="button"
            :data-testid="`quick-assign-option-${p.username}`"
            class="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:underline"
            @click="assignOnly(p.username)"
          >
            <Avatar class="size-5 text-[10px]">
              <AvatarFallback>{{ initial(p) }}</AvatarFallback>
            </Avatar>
            <span class="min-w-0 flex-1 truncate text-foreground">
              {{ p.name || p.username }}
              <span class="text-muted-foreground">@{{ p.username }}</span>
            </span>
          </button>
          <Check v-if="p.isAssigned" class="size-3.5 shrink-0 text-primary" />
          <button
            v-if="p.isAssigned"
            type="button"
            :data-testid="`quick-assign-remove-${p.username}`"
            class="shrink-0 rounded p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
            :aria-label="`Remove ${p.name || p.username} as assignee`"
            @click="removeOne(p.username)"
          >
            <X class="size-3.5" />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
