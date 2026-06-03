import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import Scratchpad from "./Scratchpad.vue";

describe("Scratchpad", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Restore real timers even if a fake-timer test throws before its own
  // cleanup — otherwise the leaked fake clock corrupts later tests.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a previously saved value into the textarea", () => {
    localStorage.setItem(
      "lumen:scratchpad:grp/proj#9",
      JSON.stringify("saved note"),
    );
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    expect((w.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "saved note",
    );
  });

  it("persists typing to localStorage", async () => {
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    await w.get("textarea").setValue("typed note");
    await nextTick();
    expect(localStorage.getItem("lumen:scratchpad:grp/proj#9")).toBe(
      JSON.stringify("typed note"),
    );
  });

  it("removes the localStorage entry when cleared", async () => {
    localStorage.setItem(
      "lumen:scratchpad:grp/proj#9",
      JSON.stringify("saved note"),
    );
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    await w.get("textarea").setValue("");
    await nextTick();
    expect(localStorage.getItem("lumen:scratchpad:grp/proj#9")).toBeNull();
  });

  it("shows a Saved indicator after an edit settles", async () => {
    vi.useFakeTimers();
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    expect(w.text()).not.toContain("Saved");
    await w.get("textarea").setValue("edit");
    vi.advanceTimersByTime(600);
    await nextTick();
    expect(w.text()).toContain("Saved");
  });

  it("hides the Saved indicator while the user is still typing", async () => {
    vi.useFakeTimers();
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    await w.get("textarea").setValue("first edit");
    vi.advanceTimersByTime(600);
    await nextTick();
    expect(w.text()).toContain("Saved");

    // A second edit within the debounce window hides it again.
    await w.get("textarea").setValue("second edit");
    await nextTick();
    expect(w.text()).not.toContain("Saved");
  });

  it("is collapsed by default (textarea hidden)", () => {
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    expect(
      w.get('[data-testid="scratchpad-toggle"]').attributes("aria-expanded"),
    ).toBe("false");
    expect(w.get("textarea").attributes("style")).toContain("display: none");
  });

  it("expands when the header toggle is clicked", async () => {
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    await w.get('[data-testid="scratchpad-toggle"]').trigger("click");
    expect(
      w.get('[data-testid="scratchpad-toggle"]').attributes("aria-expanded"),
    ).toBe("true");
    expect(w.get("textarea").attributes("style") ?? "").not.toContain(
      "display: none",
    );
  });

  it("shows a content marker only when the note has content", () => {
    const empty = mount(Scratchpad, {
      props: { fullPath: "grp/proj", iid: "9" },
    });
    expect(empty.find('[data-testid="scratchpad-marker"]').exists()).toBe(false);

    localStorage.setItem(
      "lumen:scratchpad:grp/proj#8",
      JSON.stringify("has content"),
    );
    const withContent = mount(Scratchpad, {
      props: { fullPath: "grp/proj", iid: "8" },
    });
    expect(
      withContent.find('[data-testid="scratchpad-marker"]').exists(),
    ).toBe(true);
  });

  it("persists the open state per issue", async () => {
    const w = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    await w.get('[data-testid="scratchpad-toggle"]').trigger("click");
    expect(localStorage.getItem("lumen:scratchpad-open:grp/proj#9")).toBe(
      JSON.stringify(true),
    );
    const w2 = mount(Scratchpad, { props: { fullPath: "grp/proj", iid: "9" } });
    expect(
      w2.get('[data-testid="scratchpad-toggle"]').attributes("aria-expanded"),
    ).toBe("true");
  });
});
