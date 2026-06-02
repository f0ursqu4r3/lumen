import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

const useIssue = vi.fn();
vi.mock("@/composables/useIssue", () => ({ useIssue: () => useIssue() }));

const { addNoteMutate, draftSave, draftReset, draftState } = vi.hoisted(() => ({
  addNoteMutate: vi.fn(),
  draftSave: vi.fn(),
  draftReset: vi.fn(),
  draftState: { dirty: null as null | { value: boolean } },
}));
vi.mock("@/composables/useIssueMutations", () => ({
  useAddNote: () => ({ mutate: addNoteMutate, isPending: { value: false }, error: { value: null } }),
}));
vi.mock("@/composables/useProjectMembers", async () => {
  const { ref } = await import("vue");
  return { useProjectMembers: () => ({ data: ref([]) }) };
});
vi.mock("@/composables/useProjectLabels", async () => {
  const { ref } = await import("vue");
  return { useProjectLabels: () => ({ data: ref([]) }) };
});
vi.mock("@/composables/useIssueDraft", async () => {
  const { ref, computed } = await import("vue");
  return {
    useIssueDraft: () => {
      const draft = ref({
        title: "Bug",
        description: "the description",
        state: "opened",
        labelIds: [] as string[],
        assigneeUsernames: ["a"],
      });
      draftState.dirty = ref(false);
      return {
        draft,
        dirty: draftState.dirty,
        saving: computed(() => false),
        error: ref(null),
        save: draftSave,
        reset: draftReset,
      };
    },
  };
});
vi.mock("vue-router", () => ({ onBeforeRouteLeave: vi.fn() }));

import IssueDetail from "./IssueDetail.vue";

const fullIssue = {
  id: "gid://issue/9",
  iid: "9",
  title: "Bug",
  description: "the description",
  state: "opened",
  webUrl: "#",
  createdAt: "2026-01-01T00:00:00Z",
  author: { username: "reporter", avatarUrl: null },
  milestone: { title: "v1" },
  labels: { nodes: [] },
  assignees: { nodes: [{ id: "u1", name: "Ada Lovelace", username: "a", avatarUrl: null }] },
  notes: {
    nodes: [
      { id: "n1", body: "me too", system: false, createdAt: "2026-01-01T00:00:00Z", author: { username: "a", avatarUrl: null } },
      { id: "n2", body: "changed milestone", system: true, createdAt: "2026-01-01T00:00:00Z", author: { username: "bot", avatarUrl: null } },
    ],
  },
};

const mountDetail = () =>
  mount(IssueDetail, { props: { fullPath: "grp/proj", iid: "9" } });

beforeEach(() => {
  useIssue.mockReset();
  addNoteMutate.mockReset();
  draftSave.mockReset();
  draftReset.mockReset();
  useIssue.mockReturnValue({ data: ref(fullIssue), isLoading: ref(false), error: ref(null) });
});

describe("IssueDetail (buffered)", () => {
  it("renders the editable title and description bound to the draft", async () => {
    const w = mountDetail();
    await flushPromises();
    expect((w.find('[data-testid="edit-title"]').element as HTMLInputElement).value).toBe("Bug");
    expect(w.text()).toContain("me too");
  });

  it("hides system notes", async () => {
    const w = mountDetail();
    await flushPromises();
    expect(w.text()).not.toContain("changed milestone");
  });

  it("shows the Save/Cancel footer only when dirty", async () => {
    const w = mountDetail();
    await flushPromises();
    expect(w.find('[data-testid="save-issue"]').exists()).toBe(false);
    draftState.dirty!.value = true;
    await flushPromises();
    expect(w.find('[data-testid="save-issue"]').exists()).toBe(true);
  });

  it("Save calls draft.save and Cancel calls draft.reset", async () => {
    const w = mountDetail();
    draftState.dirty!.value = true;
    await flushPromises();
    await w.get('[data-testid="save-issue"]').trigger("click");
    expect(draftSave).toHaveBeenCalled();
    await w.get('[data-testid="cancel-issue"]').trigger("click");
    expect(draftReset).toHaveBeenCalled();
  });

  it("still posts comments", async () => {
    const w = mountDetail();
    await flushPromises();
    await w.find('textarea[placeholder="Add a comment…"]').setValue("a new comment");
    await w.find("form").trigger("submit.prevent");
    expect(addNoteMutate).toHaveBeenCalledWith(
      { noteableId: "gid://issue/9", body: "a new comment" },
      expect.anything(),
    );
  });

  it("toggling state flips the draft (no immediate mutation)", async () => {
    const w = mountDetail();
    await flushPromises();
    await w.get('[data-testid="toggle-state"]').trigger("click");
    expect(w.get('[data-testid="toggle-state"]').text()).toContain("Reopen");
  });
});
