import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, RouterLinkStub, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import IssueDrawer from "@/components/IssueDrawer.vue";
import IssueComposer from "@/components/IssueComposer.vue";
import IssueRow from "@/components/IssueRow.vue";

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", name: "issues", component: { template: "<div />" } },
    {
      path: "/projects/:fullPath(.*)/issues/:iid",
      name: "issue",
      component: { template: "<div />" },
    },
  ],
});

const useIssues = vi.fn();
vi.mock("@/composables/useIssues", () => ({ useIssues: () => useIssues() }));

const { createMutate } = vi.hoisted(() => ({ createMutate: vi.fn() }));
vi.mock("@/composables/useIssueMutations", () => ({
  useCreateIssue: () => ({
    mutate: createMutate,
    isPending: { value: false },
    error: { value: null },
  }),
  useRetagIssue: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/useProjectLabels", () => ({
  useProjectLabels: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/useProjectMembers", () => ({
  useProjectMembers: () => ({ data: ref([]) }),
}));

import IssueList from "./IssueList.vue";

const mountList = () =>
  mount(IssueList, {
    props: { fullPath: "grp/proj" },
    global: {
      plugins: [router],
      stubs: { RouterLink: RouterLinkStub, IssueDrawer: true, IssueComposer: true },
    },
  });

const issue = {
  iid: "7",
  title: "Crash",
  state: "opened",
  webUrl: "#",
  labels: { nodes: [] },
  assignees: { nodes: [] },
};

// Mirrors the useIssues (useInfiniteQuery-backed) return contract.
const mockQuery = (over: Record<string, unknown> = {}) =>
  useIssues.mockReturnValue({
    issues: ref([]),
    isLoading: ref(false),
    error: ref(null),
    hasNextPage: ref(false),
    isFetchingNextPage: ref(false),
    fetchNextPage: vi.fn(),
    ...over,
  });

beforeEach(() => {
  useIssues.mockReset();
  createMutate.mockReset();
});

afterEach(async () => {
  await router.replace("/");
});

describe("IssueList", () => {
  it("renders a row per issue", async () => {
    mockQuery({ issues: ref([issue]) });
    const w = mountList();
    await flushPromises();
    expect(w.text()).toContain("Crash");
  });

  it("shows a loading state", () => {
    mockQuery({ isLoading: ref(true) });
    expect(mountList().find('[data-slot="skeleton"]').exists()).toBe(true);
  });

  it("shows the error via ErrorNotice", () => {
    mockQuery({ error: ref({ kind: "unknown", message: "boom" }) });
    expect(mountList().text()).toContain("boom");
  });

  it("shows the empty state when there are no issues", () => {
    mockQuery({ issues: ref([]) });
    const w = mountList();
    expect(w.text()).toContain("No issues");
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false);
  });

  it("has no persistent quick-create bar", () => {
    mockQuery({ issues: ref([]) });
    const w = mountList();
    expect(w.find('input[placeholder="New issue title…"]').exists()).toBe(false);
  });

  it("opens the composer from the header New issue button", async () => {
    mockQuery({ issues: ref([issue]) });
    const w = mountList();
    await w.get('[data-testid="new-issue"]').trigger('click');
    expect(w.findComponent(IssueComposer).props('open')).toBe(true);
  });

  it("opens the composer when the C key is pressed", async () => {
    mockQuery({ issues: ref([issue]) });
    const w = mountList();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    await flushPromises();
    expect(w.findComponent(IssueComposer).props('open')).toBe(true);
  });

  it("does not open the composer on C while the drawer is open", async () => {
    mockQuery({ issues: ref([issue]) });
    await router.replace('/?issue=7');
    await router.isReady();
    const w = mountList();
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    await flushPromises();
    expect(w.findComponent(IssueComposer).props('open')).toBe(false);
  });

  it("opens the composer on C even with Caps Lock (uppercase key)", async () => {
    mockQuery({ issues: ref([issue]) });
    const w = mountList();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C' }));
    await flushPromises();
    expect(w.findComponent(IssueComposer).props('open')).toBe(true);
  });

  it("does not reopen on C while the composer is already open", async () => {
    mockQuery({ issues: ref([issue]) });
    const w = mountList();
    await w.get('[data-testid="new-issue"]').trigger('click');
    expect(w.findComponent(IssueComposer).props('open')).toBe(true);
    // Closing is driven by update:open; a second C press must not interfere.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    await flushPromises();
    expect(w.findComponent(IssueComposer).props('open')).toBe(true);
  });

  it("highlights the newly created issue when the composer emits created", async () => {
    mockQuery({ issues: ref([issue]) });
    const w = mountList();
    await flushPromises();
    w.findComponent(IssueComposer).vm.$emit('created', '7');
    await flushPromises();
    expect(w.findComponent(IssueRow).props('highlight')).toBe(true);
  });

  it("opens the drawer when ?issue is present", async () => {
    mockQuery({ issues: ref([issue]) });
    await router.replace("/?issue=7");
    await router.isReady();
    const w = mountList();
    await flushPromises();
    const drawer = w.findComponent(IssueDrawer);
    expect(drawer.props("open")).toBe(true);
    expect(drawer.props("iid")).toBe("7");
  });

  it("expands to the full issue route when the drawer emits expand", async () => {
    mockQuery({ issues: ref([issue]) });
    await router.replace("/?issue=7");
    await router.isReady();
    const w = mountList();
    await flushPromises();
    w.findComponent(IssueDrawer).vm.$emit("expand");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("issue");
    expect(router.currentRoute.value.params.fullPath).toBe("grp/proj");
    expect(router.currentRoute.value.params.iid).toBe("7");
  });

  it("removes ?issue from the URL when the drawer emits update:open false", async () => {
    mockQuery({ issues: ref([issue]) });
    await router.replace("/?issue=7");
    await router.isReady();
    const w = mountList();
    await flushPromises();
    w.findComponent(IssueDrawer).vm.$emit("update:open", false);
    await flushPromises();
    expect(router.currentRoute.value.query.issue).toBeUndefined();
  });
});
