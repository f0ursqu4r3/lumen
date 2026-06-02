import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import { useIssueFilters } from "./useIssueFilters";

function setup(initialQuery: Record<string, string | string[]> = {}) {
  let api!: ReturnType<typeof useIssueFilters>;
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { render: () => null } }],
  });
  const Comp = defineComponent({
    setup() {
      api = useIssueFilters();
      return () => h("div");
    },
  });
  return { router, mountIt: async () => {
    await router.replace({ path: "/", query: initialQuery });
    await router.isReady();
    mount(Comp, { global: { plugins: [router] } });
    await nextTick();
    return api;
  }};
}

describe("useIssueFilters", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hydrates labels/assignee/author/state from the query", async () => {
    const { mountIt } = setup({ label: ["bug", "ui"], assignee: "ada", author: "bob", state: "closed" });
    const api = await mountIt();
    expect(api.labels.value).toEqual(["bug", "ui"]);
    expect(api.assignee.value).toBe("ada");
    expect(api.author.value).toBe("bob");
    expect(api.state.value).toBe("closed");
    expect(api.activeCount.value).toBe(4); // 2 labels + assignee + author
  });

  it("defaults state to opened and counts active label/assignee/author filters", async () => {
    const { mountIt } = setup();
    const api = await mountIt();
    expect(api.state.value).toBe("opened");
    expect(api.activeCount.value).toBe(0);
  });

  it("toggleLabel writes labels into the route query", async () => {
    const { router, mountIt } = setup();
    const api = await mountIt();
    api.toggleLabel("bug");
    await flushPromises();
    expect(router.currentRoute.value.query.label).toEqual("bug");
  });

  it("clearAll removes label/assignee/author but keeps unrelated query keys", async () => {
    const { router, mountIt } = setup({ label: "bug", assignee: "ada", author: "bob", issue: "9" });
    const api = await mountIt();
    api.clearAll();
    await flushPromises();
    const q = router.currentRoute.value.query;
    expect(q.label).toBeUndefined();
    expect(q.assignee).toBeUndefined();
    expect(q.author).toBeUndefined();
    expect(q.issue).toBe("9");
  });

  it("debounces search into the query as `q`", async () => {
    const { router, mountIt } = setup();
    const api = await mountIt();
    api.search.value = "crash";
    await nextTick();
    expect(router.currentRoute.value.query.q).toBeUndefined(); // not yet
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(router.currentRoute.value.query.q).toBe("crash");
  });
});
