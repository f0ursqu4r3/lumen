<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import { useTitle } from "@vueuse/core";
import { Check } from "@lucide/vue";
import { useIssue } from "@/composables/useIssue";
import { useAddNote, useUpdateIssue } from "@/composables/useIssueMutations";
import AssigneeAvatar from "@/components/AssigneeAvatar.vue";
import LabelChip from "@/components/LabelChip.vue";
import StateBadge from "@/components/StateBadge.vue";
import ErrorNotice from "@/components/ErrorNotice.vue";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MarkdownText from "@/components/MarkdownText.vue";
import Scratchpad from "@/components/Scratchpad.vue";

// `embedded` = rendered inside the slide-over drawer; the list owns the tab title
// there, so only the standalone full-page route reflects the issue in document.title.
const props = defineProps<{
  fullPath: string;
  iid: string;
  embedded?: boolean;
}>();
const {
  data: issue,
  isLoading,
  error,
} = useIssue(toRef(props, "fullPath"), toRef(props, "iid"));
const addNote = useAddNote(props.fullPath, props.iid);
const updateIssue = useUpdateIssue(props.fullPath, props.iid);

// Surfaces a failed comment/state mutation (otherwise the action fails silently).
const actionError = computed(
  () => addNote.error.value ?? updateIssue.error.value,
);

const labels = computed(
  () =>
    issue.value?.labels?.nodes?.filter(
      (l): l is NonNullable<typeof l> => !!l,
    ) ?? [],
);
const assignees = computed(
  () =>
    issue.value?.assignees?.nodes?.filter(
      (a): a is NonNullable<typeof a> => !!a,
    ) ?? [],
);
// User comments only — system notes ("changed milestone", "closed via …") are noise here.
const notes = computed(
  () =>
    issue.value?.notes?.nodes?.filter(
      (n): n is NonNullable<typeof n> => !!n && !n.system,
    ) ?? [],
);

if (!props.embedded) {
  useTitle(
    computed(() =>
      issue.value
        ? `#${issue.value.iid} ${issue.value.title} · tragit`
        : "tragit",
    ),
  );
}

const comment = ref("");
// Quiet "Posted" acknowledgement after a comment lands — same restrained idiom as
// the scratchpad's "Saved", so the action confirms without a toast.
const posted = ref(false);
let postedTimer: ReturnType<typeof setTimeout> | undefined;
function submitComment() {
  if (!issue.value || !comment.value.trim()) return;
  addNote.mutate(
    { noteableId: issue.value.id, body: comment.value },
    {
      onSuccess: () => {
        comment.value = "";
        posted.value = true;
        clearTimeout(postedTimer);
        postedTimer = setTimeout(() => (posted.value = false), 2200);
      },
    },
  );
}
// A new comment supersedes the acknowledgement.
watch(comment, (v) => v && (posted.value = false));
function toggleState() {
  if (!issue.value) return;
  updateIssue.mutate({
    stateEvent: issue.value.state === "opened" ? "CLOSE" : "REOPEN",
  });
}
</script>

<template>
  <ErrorNotice v-if="error" :error="error" />
  <div v-else-if="isLoading" class="space-y-3">
    <Skeleton class="h-7 w-2/3" />
    <Skeleton class="h-24 w-full" />
  </div>
  <article v-else-if="issue" class="space-y-4">
    <header class="flex items-center gap-2">
      <StateBadge :state="issue.state" />
      <h1 class="text-lg font-semibold">#{{ issue.iid }} {{ issue.title }}</h1>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="ml-auto"
        :disabled="updateIssue.isPending.value"
        @click="toggleState"
      >
        {{ issue.state === "opened" ? "Close issue" : "Reopen issue" }}
      </Button>
    </header>

    <p class="text-xs text-muted-foreground">
      Opened by
      <span class="font-medium text-foreground">{{
        issue.author ? "@" + issue.author.username : "(deleted user)"
      }}</span>
      · {{ new Date(issue.createdAt).toLocaleString() }}
    </p>

    <ErrorNotice v-if="actionError" :error="actionError" />

    <MarkdownText
      v-if="issue.description"
      :source="issue.description"
      :project-path="fullPath"
      class="text-sm"
    />

    <div v-if="labels.length" class="flex flex-wrap gap-2">
      <LabelChip
        v-for="l in labels"
        :key="l.id"
        :title="l.title"
        :color="l.color"
      />
    </div>
    <div v-if="assignees.length" class="flex flex-wrap gap-2">
      <AssigneeAvatar
        v-for="a in assignees"
        :key="a.id"
        :username="a.username"
        :avatar-url="a.avatarUrl"
      />
    </div>
    <p v-if="issue.milestone" class="text-xs text-muted-foreground">
      Milestone: {{ issue.milestone.title }}
    </p>

    <section class="space-y-3">
      <h2 class="text-sm font-semibold">Notes</h2>
      <Card v-for="n in notes" :key="n.id" class="py-0">
        <CardContent class="px-3 py-2 text-sm">
          <span class="font-medium">{{
            n.author ? "@" + n.author.username : "(deleted user)"
          }}</span>
          <span class="ml-2 text-xs text-muted-foreground">
            {{ new Date(n.createdAt).toLocaleString() }}
          </span>
          <MarkdownText
            :source="n.body"
            :project-path="fullPath"
            class="mt-1"
          />
        </CardContent>
      </Card>
      <form class="space-y-2" @submit.prevent="submitComment">
        <Textarea v-model="comment" :rows="3" placeholder="Add a comment…" />
        <div class="flex items-center gap-3">
          <Button type="submit" :disabled="addNote.isPending.value"
            >Comment</Button
          >
          <!-- Live region stays mounted so screen readers announce the change. -->
          <span aria-live="polite" class="text-xs text-muted-foreground">
            <span
              v-if="posted"
              class="animate-status inline-flex items-center gap-1"
            >
              <Check class="size-3.5 text-emerald-400" />Posted
            </span>
          </span>
        </div>
      </form>
    </section>
    <Scratchpad :full-path="fullPath" :iid="iid" />
  </article>
  <p v-else class="text-sm text-muted-foreground">Issue not found.</p>
</template>
