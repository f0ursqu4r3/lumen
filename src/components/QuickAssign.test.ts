import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const { updateMutate } = vi.hoisted(() => ({ updateMutate: vi.fn() }));
vi.mock("@/composables/useIssueMutations", () => ({
  useUpdateIssue: () => ({
    mutate: updateMutate,
    isPending: { value: false },
    error: { value: null },
  }),
}));

import QuickAssign from "./QuickAssign.vue";

const issue = {
  author: { username: "reporter", name: "Rita Reporter", avatarUrl: null },
  assignees: {
    nodes: [{ id: "u1", username: "ada", name: "Ada", avatarUrl: null }],
  },
  notes: {
    nodes: [
      {
        id: "n1",
        system: false,
        createdAt: "2026-01-02T00:00:00Z",
        author: { username: "cory", name: "Cory", avatarUrl: null },
      },
      {
        id: "n2",
        system: true,
        createdAt: "2026-01-03T00:00:00Z",
        author: { username: "bot", name: "Bot", avatarUrl: null },
      },
    ],
  },
};
const members = [
  { id: "m1", username: "ada", name: "Ada", avatarUrl: null },
  { id: "m2", username: "cory", name: "Cory", avatarUrl: null },
  { id: "m3", username: "dee", name: "Dee", avatarUrl: null },
];

const mountQA = () =>
  mount(QuickAssign, {
    props: { fullPath: "grp/proj", iid: "9", issue: issue as never, members },
  });

beforeEach(() => updateMutate.mockReset());

describe("QuickAssign", () => {
  it("assigns a member as the sole assignee on click", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-option-dee"]').trigger("click");
    expect(updateMutate).toHaveBeenCalledWith({ assigneeUsernames: ["dee"] });
  });

  it("removes a single current assignee", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-remove-ada"]').trigger("click");
    expect(updateMutate).toHaveBeenCalledWith({ assigneeUsernames: [] });
  });

  it("unassigns everyone", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-unassign-all"]').trigger("click");
    expect(updateMutate).toHaveBeenCalledWith({ assigneeUsernames: [] });
  });

  it("dedups people to one option and shows group labels", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    expect(w.findAll('[data-testid="quick-assign-option-ada"]')).toHaveLength(1);
    expect(w.findAll('[data-testid="quick-assign-option-cory"]')).toHaveLength(1);
    expect(w.text()).toContain("Reporter");
    expect(w.text()).toContain("Assigned");
    expect(w.text()).toContain("Commented");
    expect(w.text()).toContain("Project members");
  });

  it("hides Unassign all when there are no assignees", async () => {
    const w = mount(QuickAssign, {
      props: {
        fullPath: "grp/proj",
        iid: "9",
        issue: { ...issue, assignees: { nodes: [] } } as never,
        members,
      },
    });
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    expect(w.find('[data-testid="quick-assign-unassign-all"]').exists()).toBe(
      false,
    );
  });
});
