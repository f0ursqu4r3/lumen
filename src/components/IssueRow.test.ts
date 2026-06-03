import { describe, it, expect } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import IssueRow from "./IssueRow.vue";

const issue = {
  iid: "7",
  title: "Crash on save",
  state: "opened" as const,
  webUrl: "#",
  createdAt: "2026-01-01T00:00:00Z",
  labels: { nodes: [{ id: "l1", title: "bug", color: "#f00" }] },
  assignees: { nodes: [] },
};

describe("IssueRow", () => {
  it("links to the issue drawer and shows the title + label", () => {
    const w = mount(IssueRow, {
      props: { issue, fullPath: "grp/proj" },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
    expect(w.text()).toContain("Crash on save");
    expect(w.text()).toContain("bug");
    expect(w.findComponent(RouterLinkStub).props("to")).toEqual({
      query: { issue: "7" },
    });
  });

  it('applies the flash-highlight class when highlight is true', () => {
    const w = mount(IssueRow, {
      props: { issue, fullPath: 'grp/proj', highlight: true },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.get('div').classes()).toContain('animate-flash')
  })
});
