import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { VueQueryPlugin } from "@tanstack/vue-query";
import App from "./App.vue";

// Counts how many times the routed view is mounted, so we can assert when the
// RouterView :key forces a remount.
let mounts = 0;
const CountingView = {
  setup() {
    mounts++;
    return () => null;
  },
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: "/projects/:fullPath(.*)/issues",
      name: "issues",
      component: CountingView,
    },
    {
      path: "/projects/:fullPath(.*)/issues/:iid",
      name: "issue",
      component: CountingView,
    },
  ],
});

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  mounts = 0;
});

// Unmount between tests so a lingering App instance doesn't keep reacting to the
// shared router and inflate the mount counter.
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe("App routed-view keying", () => {
  // The ?issue drawer is a query-only change. It must overlay the list without
  // remounting the routed view (which would refetch project.issues).
  it("does not remount the view on a query-only change (drawer open/close)", async () => {
    await router.replace("/projects/grp/proj/issues");
    await router.isReady();
    wrapper = mount(App, { global: { plugins: [router, VueQueryPlugin] } });
    expect(mounts).toBe(1);

    await router.replace("/projects/grp/proj/issues?issue=7"); // open drawer
    await flushPromises();
    expect(mounts).toBe(1);

    await router.replace("/projects/grp/proj/issues"); // close drawer
    await flushPromises();
    expect(mounts).toBe(1);
  });

  // Path/param changes (e.g. expanding to the full-page issue) must still
  // remount so composables that capture route params at setup don't go stale.
  it("remounts the view when the path changes (full-page issue navigation)", async () => {
    await router.replace("/projects/grp/proj/issues");
    await router.isReady();
    wrapper = mount(App, { global: { plugins: [router, VueQueryPlugin] } });
    expect(mounts).toBe(1);

    await router.replace("/projects/grp/proj/issues/7"); // expand to full page
    await flushPromises();
    expect(mounts).toBe(2);
  });
});
