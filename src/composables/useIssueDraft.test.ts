import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";
import { withQuery } from "@/test/withQuery";

const { updateAsync, setAsync } = vi.hoisted(() => ({
  updateAsync: vi.fn(),
  setAsync: vi.fn(),
}));
vi.mock("@/composables/useIssueMutations", () => ({
  useUpdateIssue: () => ({
    mutateAsync: updateAsync,
    isPending: { value: false },
    error: { value: null },
  }),
  useSetAssignees: () => ({
    mutateAsync: setAsync,
    isPending: { value: false },
    error: { value: null },
  }),
}));

import { useIssueDraft } from "./useIssueDraft";

const issue = {
  title: "Bug",
  description: "desc",
  state: "opened",
  labels: { nodes: [{ id: "l1" }] },
  assignees: { nodes: [{ username: "ada" }] },
};

beforeEach(() => {
  updateAsync.mockReset().mockResolvedValue({});
  setAsync.mockReset().mockResolvedValue({});
});

describe("useIssueDraft", () => {
  it("seeds the draft from the issue and starts clean", () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() => useIssueDraft("grp/proj", "9", issueRef));
    expect(result().draft.value?.title).toBe("Bug");
    expect(result().dirty.value).toBe(false);
  });

  it("becomes dirty on edit and clean after reset", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() => useIssueDraft("grp/proj", "9", issueRef));
    result().draft.value!.title = "New";
    await nextTick();
    expect(result().dirty.value).toBe(true);
    result().reset();
    await nextTick();
    expect(result().dirty.value).toBe(false);
    expect(result().draft.value?.title).toBe("Bug");
  });

  it("save dispatches only the changed mutations", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() => useIssueDraft("grp/proj", "9", issueRef));
    result().draft.value!.title = "New";
    result().draft.value!.assigneeUsernames = ["ada", "bob"];
    await nextTick();
    await result().save();
    expect(updateAsync).toHaveBeenCalledWith({ title: "New" });
    expect(setAsync).toHaveBeenCalledWith({ assigneeUsernames: ["ada", "bob"] });
  });

  it("save with only metadata change does not call setAssignees", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() => useIssueDraft("grp/proj", "9", issueRef));
    result().draft.value!.description = "d2";
    await nextTick();
    await result().save();
    expect(updateAsync).toHaveBeenCalledWith({ description: "d2" });
    expect(setAsync).not.toHaveBeenCalled();
  });

  it("re-syncs from the server only while clean", async () => {
    const issueRef = ref({ ...issue });
    const { result } = withQuery(() => useIssueDraft("grp/proj", "9", issueRef));
    // dirty edit must survive a background refetch
    result().draft.value!.title = "Mine";
    await nextTick();
    issueRef.value = { ...issue, title: "Server" };
    await nextTick();
    expect(result().draft.value?.title).toBe("Mine");
    // when clean, a refetch updates the draft
    result().reset();
    issueRef.value = { ...issue, title: "Server2" };
    await nextTick();
    expect(result().draft.value?.title).toBe("Server2");
  });
});
