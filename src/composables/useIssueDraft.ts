import { computed, ref, watch, type Ref } from "vue";
import {
  useSetAssignees,
  useUpdateIssue,
} from "@/composables/useIssueMutations";
import {
  diffIssueEdit,
  draftFromIssue,
  isDirty,
  type IssueDraft,
} from "@/lib/issueEdit";

type IssueLike = Parameters<typeof draftFromIssue>[0] | null | undefined;

/**
 * Buffers issue edits: a local `draft` seeded from the server issue, a `dirty`
 * flag, and `save()` that fires only the mutations the diff requires. The draft
 * re-syncs from the server only while clean, so a background refetch never
 * clobbers in-flight edits.
 */
export function useIssueDraft(
  fullPath: string,
  iid: string,
  issue: Ref<IssueLike>,
) {
  const update = useUpdateIssue(fullPath, iid);
  const setAssignees = useSetAssignees(fullPath, iid);

  const original = ref<IssueDraft | null>(null);
  const draft = ref<IssueDraft | null>(null);

  function sync() {
    if (!issue.value) return;
    original.value = draftFromIssue(issue.value);
    draft.value = draftFromIssue(issue.value);
  }

  const dirty = computed(
    () => !!original.value && !!draft.value && isDirty(original.value, draft.value),
  );
  const saving = computed(
    () => update.isPending.value || setAssignees.isPending.value,
  );
  const error = computed(
    () => update.error.value ?? setAssignees.error.value ?? null,
  );

  watch(
    issue,
    () => {
      if (!draft.value || !dirty.value) sync();
    },
    { immediate: true },
  );

  async function save() {
    if (!original.value || !draft.value) return;
    const diff = diffIssueEdit(original.value, draft.value);
    try {
      if (diff.update) await update.mutateAsync(diff.update);
      if (diff.assignees)
        await setAssignees.mutateAsync({ assigneeUsernames: diff.assignees });
    } catch {
      // Surfaced via the `error` computed; leave the draft intact so the user
      // can retry or cancel.
    }
  }

  function reset() {
    sync();
  }

  return { draft, dirty, saving, error, save, reset };
}
