import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

const useIssue = vi.fn();
vi.mock("@/composables/useIssue", () => ({ useIssue: () => useIssue() }));

const { addNoteMutate, updateMutate } = vi.hoisted(() => ({
  addNoteMutate: vi.fn(),
  updateMutate: vi.fn(),
}));
vi.mock("@/composables/useIssueMutations", () => ({
  useAddNote: () => ({
    mutate: addNoteMutate,
    isPending: { value: false },
    error: { value: null },
  }),
  useUpdateIssue: () => ({
    mutate: updateMutate,
    isPending: { value: false },
    error: { value: null },
  }),
}));

import IssueDetail from "./IssueDetail.vue";

const mountDetail = () =>
  mount(IssueDetail, { props: { fullPath: "grp/proj", iid: "9" } });

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
  assignees: { nodes: [{ id: "u1", username: "a", avatarUrl: null }] },
  notes: {
    nodes: [
      {
        id: "n1",
        body: "me too",
        system: false,
        createdAt: "2026-01-01T00:00:00Z",
        author: { username: "a", avatarUrl: null },
      },
      {
        id: "n2",
        body: "changed milestone",
        system: true,
        createdAt: "2026-01-01T00:00:00Z",
        author: { username: "bot", avatarUrl: null },
      },
    ],
  },
};

beforeEach(() => {
  useIssue.mockReset();
  addNoteMutate.mockReset();
  updateMutate.mockReset();
});

describe("IssueDetail", () => {
  it("renders title, description, assignee, and user notes", async () => {
    useIssue.mockReturnValue({
      data: ref(fullIssue),
      isLoading: ref(false),
      error: ref(null),
    });
    const w = mountDetail();
    await flushPromises();
    expect(w.text()).toContain("Bug");
    expect(w.text()).toContain("the description");
    expect(w.text()).toContain("@a");
    expect(w.text()).toContain("me too");
    expect(w.text()).toContain("Scratchpad");
  });

  it("shows the issue originator", async () => {
    useIssue.mockReturnValue({
      data: ref(fullIssue),
      isLoading: ref(false),
      error: ref(null),
    });
    const w = mountDetail();
    await flushPromises();
    expect(w.text()).toContain("Opened by");
    expect(w.text()).toContain("@reporter");
  });

  it("hides system notes", async () => {
    useIssue.mockReturnValue({
      data: ref(fullIssue),
      isLoading: ref(false),
      error: ref(null),
    });
    const w = mountDetail();
    await flushPromises();
    expect(w.text()).not.toContain("changed milestone");
  });

  it("shows a loading state", () => {
    useIssue.mockReturnValue({
      data: ref(undefined),
      isLoading: ref(true),
      error: ref(null),
    });
    expect(mountDetail().find('[data-slot="skeleton"]').exists()).toBe(true);
  });

  it("shows the error via ErrorNotice", () => {
    useIssue.mockReturnValue({
      data: ref(undefined),
      isLoading: ref(false),
      error: ref({ kind: "unknown", message: "boom" }),
    });
    expect(mountDetail().text()).toContain("boom");
  });

  it("shows a not-found message when the issue is null", () => {
    useIssue.mockReturnValue({
      data: ref(null),
      isLoading: ref(false),
      error: ref(null),
    });
    expect(mountDetail().text()).toContain("Issue not found");
  });

  it("adds a note when the comment form is submitted", async () => {
    useIssue.mockReturnValue({
      data: ref(fullIssue),
      isLoading: ref(false),
      error: ref(null),
    });
    const w = mountDetail();
    await flushPromises();
    // Scratchpad adds a second textarea, so target the comment box explicitly.
    await w
      .find('textarea[placeholder="Add a comment…"]')
      .setValue("a new comment");
    await w.find("form").trigger("submit.prevent");
    expect(addNoteMutate).toHaveBeenCalledWith(
      { noteableId: "gid://issue/9", body: "a new comment" },
      expect.anything(),
    );
  });

  it("toggles issue state via the close button", async () => {
    useIssue.mockReturnValue({
      data: ref(fullIssue),
      isLoading: ref(false),
      error: ref(null),
    });
    const w = mountDetail();
    await flushPromises();
    await w.find('button[type="button"]').trigger("click");
    expect(updateMutate).toHaveBeenCalledWith({ stateEvent: "CLOSE" });
  });
});
