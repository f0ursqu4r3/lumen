import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LabelGroupMenu from "./LabelGroupMenu.vue";
import { groupLabelsByScope } from "@/lib/labelGroups";

const groups = groupLabelsByScope([
  { id: "l1", title: "bug", color: "#f00" },
  { id: "l2", title: "priority::high", color: "#fa0" },
  { id: "l3", title: "priority::low", color: "#0a0" },
]);

const mountMenu = (selected: string[] = []) =>
  mount(LabelGroupMenu, { props: { groups, selected } });

describe("LabelGroupMenu", () => {
  it("renders a row per scope group", () => {
    const w = mountMenu();
    expect(w.find('[data-testid="lgm-scope-priority"]').exists()).toBe(true);
    expect(w.find('[data-testid="lgm-scope-__none"]').exists()).toBe(true);
  });

  it("hides options until a scope row is opened, then shows them", async () => {
    const w = mountMenu();
    expect(w.find('[data-testid="lgm-opt-priority::high"]').exists()).toBe(false);
    await w.get('[data-testid="lgm-scope-priority"]').trigger("click");
    expect(w.find('[data-testid="lgm-opt-priority::high"]').exists()).toBe(true);
    expect(w.find('[data-testid="lgm-opt-priority::low"]').exists()).toBe(true);
  });

  it("emits toggle with the full title when an option is clicked", async () => {
    const w = mountMenu();
    await w.get('[data-testid="lgm-scope-priority"]').trigger("click");
    await w.get('[data-testid="lgm-opt-priority::high"]').trigger("click");
    expect(w.emitted("toggle")?.at(-1)).toEqual(["priority::high"]);
  });

  it("marks selected options with a check", async () => {
    const w = mountMenu(["priority::high"]);
    await w.get('[data-testid="lgm-scope-priority"]').trigger("click");
    expect(w.find('[data-testid="lgm-check-priority::high"]').exists()).toBe(true);
    expect(w.find('[data-testid="lgm-check-priority::low"]').exists()).toBe(false);
  });
});
