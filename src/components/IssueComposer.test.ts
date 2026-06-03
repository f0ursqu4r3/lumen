import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

const { createMutate, isPending, mutationError } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  isPending: { value: false },
  mutationError: { value: null as unknown },
}));
vi.mock("@/composables/useIssueMutations", () => ({
  useCreateIssue: () => ({
    mutate: createMutate,
    isPending,
    error: mutationError,
  }),
}));
vi.mock("@/composables/useProjectLabels", () => ({
  useProjectLabels: () => ({
    data: ref([{ id: "l1", title: "bug", color: "#f00" }]),
  }),
}));
vi.mock("@/composables/useProjectMembers", () => ({
  useProjectMembers: () => ({
    data: ref([
      { id: "gid://user/1", username: "kdougan", name: "K D", avatarUrl: null },
    ]),
  }),
}));

import IssueComposer from "./IssueComposer.vue";

// SheetContent portals to <body> (reka-ui DialogPortal), so we attach to body and
// query the document directly — the same approach IssueDrawer.test.ts uses.
const mountComposer = () =>
  mount(IssueComposer, {
    props: { open: true, fullPath: "grp/proj" },
    attachTo: document.body,
  });

const q = <T extends Element = HTMLElement>(sel: string) =>
  document.body.querySelector(sel) as T | null;

// Set a v-model-bound field and fire the input event so the model updates.
const setField = async (sel: string, value: string) => {
  const el = q<HTMLInputElement | HTMLTextAreaElement>(sel)!;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  await flushPromises();
};

const click = async (sel: string) => {
  q(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await flushPromises();
};

const submitForm = async () => {
  q('[data-testid="composer-form"]')!.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
  await flushPromises();
};

beforeEach(() => {
  createMutate.mockReset();
  isPending.value = false;
  mutationError.value = null;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("IssueComposer", () => {
  it("disables Create until the title is non-empty", async () => {
    mountComposer();
    await flushPromises();
    expect(q('[data-testid="composer-submit"]')!.hasAttribute("disabled")).toBe(
      true,
    );
    await setField('[data-testid="composer-title"]', "Fix it");
    expect(q('[data-testid="composer-submit"]')!.hasAttribute("disabled")).toBe(
      false,
    );
  });

  it('hides labels/assignee until "Add details" is clicked', async () => {
    mountComposer();
    await flushPromises();
    expect(q('[data-testid="label-picker-trigger"]')).toBeNull();
    await click('[data-testid="composer-add-details"]');
    expect(q('[data-testid="label-picker-trigger"]')).not.toBeNull();
    expect(q('[data-testid="assignee-picker-trigger"]')).not.toBeNull();
  });

  it("submits title, description, labels and assigneeIds", async () => {
    mountComposer();
    await flushPromises();
    await setField('[data-testid="composer-title"]', "Fix it");
    await setField('[data-testid="composer-description"]', "details");
    await click('[data-testid="composer-add-details"]');
    await click('[data-testid="label-picker-trigger"]');
    await click('[data-testid="lgm-scope-__none"]');
    await click('[data-testid="lgm-opt-bug"]');
    await click('[data-testid="assignee-picker-trigger"]');
    await click('[data-testid="assignee-option-kdougan"]');
    await submitForm();
    expect(createMutate).toHaveBeenCalledWith(
      {
        title: "Fix it",
        description: "details",
        labels: ["bug"],
        assigneeIds: ["gid://user/1"],
      },
      expect.anything(),
    );
  });

  it("omits empty optional fields from the payload", async () => {
    mountComposer();
    await flushPromises();
    await setField('[data-testid="composer-title"]', "Just a title");
    await submitForm();
    expect(createMutate).toHaveBeenCalledWith(
      { title: "Just a title" },
      expect.anything(),
    );
  });

  it("emits created with the new iid and requests close on success", async () => {
    createMutate.mockImplementation((_vars, opts) =>
      opts.onSuccess({ issue: { iid: "42" } }),
    );
    const w = mountComposer();
    await flushPromises();
    await setField('[data-testid="composer-title"]', "Fix it");
    await submitForm();
    expect(w.emitted("created")?.at(-1)).toEqual(["42"]);
    expect(w.emitted("update:open")?.at(-1)).toEqual([false]);
  });
});
