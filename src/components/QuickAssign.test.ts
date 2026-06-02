import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

// errorHolder.ref is a real reactive ref so a test can flip the mutation into an
// error state and assert the component re-emits it.
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

beforeEach(() => {
  setMutate.mockReset();
  if (errorHolder.ref) errorHolder.ref.value = null;
});

describe("QuickAssign", () => {
  it("assigns a member as the sole assignee on click", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-option-dee"]').trigger("click");
    expect(setMutate).toHaveBeenCalledWith({ assigneeUsernames: ["dee"] });
  });

  it("removes a single current assignee", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-remove-ada"]').trigger("click");
    expect(setMutate).toHaveBeenCalledWith({ assigneeUsernames: [] });
  });

  it("unassigns everyone", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-unassign-all"]').trigger("click");
    expect(setMutate).toHaveBeenCalledWith({ assigneeUsernames: [] });
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

  it("re-emits its mutation error so the parent can surface it", async () => {
    const w = mountQA();
    const failure = { kind: "graphql", message: "Insufficient permissions" };
    errorHolder.ref!.value = failure;
    await nextTick();
    expect(w.emitted("error")?.at(-1)).toEqual([failure]);
  });
});
