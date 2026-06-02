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
  it("shows a 'Quick assign' label on the trigger (no avatars/usernames)", () => {
    const w = mountQA();
    const trigger = w.get('[data-testid="quick-assign-trigger"]');
    expect(trigger.text()).toContain("Quick assign");
    expect(trigger.text()).not.toContain("@");
  });

  it("replaces all assignees with the clicked member and closes", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-option-dee"]').trigger("click");
    await nextTick();
    expect(setMutate).toHaveBeenCalledWith({ assigneeUsernames: ["dee"] });
    expect(w.find('[role="menu"]').exists()).toBe(false);
  });

  it("shows grouped, labelled, deduped options", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    expect(w.findAll('[data-testid="quick-assign-option-ada"]')).toHaveLength(1);
    expect(w.findAll('[data-testid="quick-assign-option-cory"]')).toHaveLength(1);
    expect(w.text()).toContain("Reporter");
    expect(w.text()).toContain("Assigned");
    expect(w.text()).toContain("Commented");
    expect(w.text()).toContain("Project members");
  });

  it("no longer renders remove or unassign-all controls", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    expect(w.find('[data-testid="quick-assign-remove-ada"]').exists()).toBe(
      false,
    );
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
