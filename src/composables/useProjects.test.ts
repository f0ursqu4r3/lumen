import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { withQuery } from "@/test/withQuery";

const request = vi.fn();
vi.mock("@/gitlab/client", () => ({
  gqlClient: { request: (...a: unknown[]) => request(...a) },
}));

import { useProjects } from "./useProjects";

beforeEach(() => {
  request.mockReset();
});

describe("useProjects", () => {
  it("returns the projects nodes from the response", async () => {
    request.mockResolvedValue({
      projects: {
        nodes: [{ id: "gid://1", fullPath: "grp/proj", name: "Proj" }],
      },
    });
    const { result } = withQuery(() => useProjects(ref("proj")));
    await flushPromises();
    expect(result().data.value).toEqual([
      { id: "gid://1", fullPath: "grp/proj", name: "Proj" },
    ]);
  });

  it("exposes a normalized error", async () => {
    request.mockRejectedValue(new Error("down"));
    const { result } = withQuery(() => useProjects(ref("")));
    await flushPromises();
    expect(result().error.value).toMatchObject({
      kind: "unknown",
      message: "down",
    });
  });
});
