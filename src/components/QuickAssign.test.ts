import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import QuickAssign from "./QuickAssign.vue";

const issue = {
  author: { username: "reporter", name: "Rita", avatarUrl: null },
  assignees: {
    nodes: [{ id: "u1", username: "ada", name: "Ada", avatarUrl: null }],
  },
  notes: { nodes: [] },
};
const members = [
  { id: "m1", username: "ada", name: "Ada", avatarUrl: null },
  { id: "m2", username: "bob", name: "Bob", avatarUrl: null },
];

const mountQA = (usernames = ["ada"]) =>
  mount(QuickAssign, { props: { issue: issue as never, members, usernames } });

describe("QuickAssign (controlled)", () => {
  it("emits a single-person replace list when a member is picked", async () => {
    const w = mountQA();
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    await w.get('[data-testid="quick-assign-option-bob"]').trigger("click");
    expect(w.emitted("update:usernames")?.at(-1)).toEqual([["bob"]]);
  });

  it("checkmark reflects the usernames prop", async () => {
    const w = mountQA(["ada"]);
    await w.get('[data-testid="quick-assign-trigger"]').trigger("click");
    expect(
      w.find('[data-testid="quick-assign-option-ada"] .text-primary').exists(),
    ).toBe(true);
  });
});
