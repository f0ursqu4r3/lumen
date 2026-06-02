import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

const { setMutate, errorHolder } = vi.hoisted(() => ({
  setMutate: vi.fn(),
  errorHolder: { ref: null as null | { value: unknown } },
}));
vi.mock("@/composables/useIssueMutations", async () => {
  const { ref } = await import("vue");
  errorHolder.ref = ref(null);
  return {
    useSetAssignees: () => ({
      mutate: setMutate,
      isPending: { value: false },
      error: errorHolder.ref,
    }),
  };
});

import AssigneeEditor from "./AssigneeEditor.vue";

const issue = {
  author: { username: "reporter", name: "Rita Reporter", avatarUrl: null },
  assignees: {
    nodes: [
      { id: "u1", username: "ada", name: "Ada Lovelace", avatarUrl: null },
      { id: "u2", username: "bob", name: "Bob Bk", avatarUrl: null },
    ],
  },
  notes: {
    nodes: [
      {
        id: "n1",
        system: false,
        createdAt: "2026-01-02T00:00:00Z",
        author: { username: "cory", name: "Cory", avatarUrl: null },
      },
    ],
  },
};
const members = [
  { id: "m1", username: "ada", name: "Ada Lovelace", avatarUrl: null },
  { id: "m2", username: "bob", name: "Bob Bk", avatarUrl: null },
  { id: "m3", username: "cory", name: "Cory", avatarUrl: null },
  { id: "m4", username: "dee", name: "Dee", avatarUrl: null },
];

const mountEditor = () =>
  mount(AssigneeEditor, {
    props: { fullPath: "grp/proj", iid: "9", issue: issue as never, members },
  });

beforeEach(() => {
  setMutate.mockReset();
  if (errorHolder.ref) errorHolder.ref.value = null;
});

describe("AssigneeEditor", () => {
  it("renders a row per current assignee showing the full name", () => {
    const w = mountEditor();
    expect(w.find('[data-testid="assignee-remove-ada"]').exists()).toBe(true);
    expect(w.find('[data-testid="assignee-remove-bob"]').exists()).toBe(true);
    expect(w.text()).toContain("Ada Lovelace");
    expect(w.text()).toContain("Bob Bk");
  });

  it("removes a current assignee (commits the minus list)", async () => {
    const w = mountEditor();
    await w.get('[data-testid="assignee-remove-ada"]').trigger("click");
    expect(setMutate).toHaveBeenCalledWith({ assigneeUsernames: ["bob"] });
  });

  it("adds an unassigned member from the dropdown (commits the plus list)", async () => {
    const w = mountEditor();
    await w.get('[data-testid="assignee-add-trigger"]').trigger("click");
    await w.get('[data-testid="assignee-option-dee"]').trigger("click");
    expect(setMutate).toHaveBeenCalledWith({
      assigneeUsernames: ["ada", "bob", "dee"],
    });
  });

  it("removes an already-assigned member from the dropdown (commits the minus list)", async () => {
    const w = mountEditor();
    await w.get('[data-testid="assignee-add-trigger"]').trigger("click");
    await w.get('[data-testid="assignee-option-ada"]').trigger("click");
    expect(setMutate).toHaveBeenCalledWith({ assigneeUsernames: ["bob"] });
  });

  it("re-emits its mutation error so the parent can surface it", async () => {
    const w = mountEditor();
    const failure = { kind: "graphql", message: "Insufficient permissions" };
    errorHolder.ref!.value = failure;
    await nextTick();
    expect(w.emitted("error")?.at(-1)).toEqual([failure]);
  });
});
