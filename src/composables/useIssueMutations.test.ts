import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { withQuery } from "@/test/withQuery";

const request = vi.fn();
vi.mock("@/gitlab/client", () => ({
  gqlClient: { request: (...a: unknown[]) => request(...a) },
}));

import {
  useAddNote,
  useUpdateIssue,
  useCreateIssue,
} from "./useIssueMutations";

beforeEach(() => {
  request.mockReset();
});

describe("issue mutations", () => {
  it("useAddNote invalidates the issue query on success", async () => {
    request.mockResolvedValue({
      createNote: { note: { id: "n2" }, errors: [] },
    });
    const { result, queryClient } = withQuery(() =>
      useAddNote("grp/proj", "9"),
    );
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    result().mutate({ noteableId: "gid://issue/9", body: "hi" });
    await flushPromises();
    expect(request).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ["issue", "grp/proj", "9"] });
  });

  it("useUpdateIssue throws normalized error on GraphQL errors[]", async () => {
    request.mockResolvedValue({
      updateIssue: { issue: null, errors: ["nope"] },
    });
    const { result } = withQuery(() => useUpdateIssue("grp/proj", "9"));
    await expect(
      (
        result() as { mutateAsync: (v: unknown) => Promise<unknown> }
      ).mutateAsync({ stateEvent: "CLOSE" }),
    ).rejects.toMatchObject({ kind: "graphql", message: "nope" });
  });

  it("useCreateIssue invalidates the project issue list", async () => {
    request.mockResolvedValue({
      createIssue: { issue: { iid: "10" }, errors: [] },
    });
    const { result, queryClient } = withQuery(() => useCreateIssue("grp/proj"));
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    result().mutate({ title: "New" });
    await flushPromises();
    expect(spy).toHaveBeenCalledWith({ queryKey: ["issues", "grp/proj"] });
  });

  it("useCreateIssue rejects with a normalized error on GraphQL errors[]", async () => {
    request.mockResolvedValue({
      createIssue: { issue: null, errors: ["bad"] },
    });
    const { result } = withQuery(() => useCreateIssue("grp/proj"));
    await expect(
      (
        result() as { mutateAsync: (v: unknown) => Promise<unknown> }
      ).mutateAsync({ title: "x" }),
    ).rejects.toMatchObject({ kind: "graphql", message: "bad" });
  });

  it("useAddNote rejects with a normalized error on a transport failure", async () => {
    request.mockRejectedValue(new Error("down"));
    const { result } = withQuery(() => useAddNote("grp/proj", "9"));
    await expect(
      (
        result() as { mutateAsync: (v: unknown) => Promise<unknown> }
      ).mutateAsync({
        noteableId: "gid://issue/9",
        body: "hi",
      }),
    ).rejects.toMatchObject({ kind: "unknown", message: "down" });
  });
});
