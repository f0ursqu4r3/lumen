import { describe, it, expect, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import IssueDrawer from "./IssueDrawer.vue";

// IssueDetail does its own data fetching; stub it to a marker.
const IssueDetailStub = {
  name: "IssueDetail",
  props: ["fullPath", "iid"],
  template: '<div class="detail-stub">detail {{ iid }}</div>',
};

// SheetContent portals to <body>, so attach to body and query the document.
const mountDrawer = (open: boolean, iid: string | null = "7") =>
  mount(IssueDrawer, {
    props: { open, fullPath: "grp/proj", iid },
    attachTo: document.body,
    global: { stubs: { IssueDetail: IssueDetailStub } },
  });

afterEach(() => {
  document.body.innerHTML = "";
});

describe("IssueDrawer", () => {
  it("renders the issue detail and #iid title when open", async () => {
    mountDrawer(true);
    await flushPromises();
    expect(document.body.querySelector(".detail-stub")).not.toBeNull();
    expect(document.body.textContent).toContain("#7");
  });

  it("does not render the issue detail when closed", () => {
    mountDrawer(false);
    expect(document.body.querySelector(".detail-stub")).toBeNull();
  });

  it("emits expand when the expand button is clicked", async () => {
    const w = mountDrawer(true);
    await flushPromises();
    const btn = document.body.querySelector(
      '[aria-label="Expand to full page"]',
    ) as HTMLElement | null;
    expect(btn).not.toBeNull();
    btn!.click();
    await w.vm.$nextTick();
    expect(w.emitted("expand")).toHaveLength(1);
  });

  it("forwards the embedded detail's dirty state", async () => {
    const w = mount(IssueDrawer, {
      props: { open: true, fullPath: "grp/proj", iid: "9" },
      attachTo: document.body,
      global: {
        stubs: {
          IssueDetail: {
            emits: ["update:dirty"],
            mounted() { (this as any).$emit("update:dirty", true); },
            template: "<div />",
          },
        },
      },
    });
    await w.vm.$nextTick();
    expect(w.emitted("update:dirty")?.at(-1)).toEqual([true]);
  });
});
