import { describe, it, expect, vi, beforeEach } from "vitest";

const { gitlabAsset } = vi.hoisted(() => ({ gitlabAsset: vi.fn() }));
vi.mock("@/lib/rpc", () => ({ rpc: { gitlabAsset } }));

import { resolveAsset, __clearAssetCache } from "./useGitlabAsset";

beforeEach(() => {
  gitlabAsset.mockReset();
  __clearAssetCache();
  let n = 0;
  (globalThis.URL as any).createObjectURL = vi.fn(() => `blob:fake/${n++}`);
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

describe("resolveAsset", () => {
  it("fetches bytes via RPC and returns a blob URL", async () => {
    gitlabAsset.mockResolvedValue({ base64: btoa("hello"), contentType: "image/png" });
    const url = await resolveAsset("/v4/projects/1/uploads/abc/x.png");
    expect(url).toBe("blob:fake/0");
    expect(gitlabAsset).toHaveBeenCalledWith({ path: "/v4/projects/1/uploads/abc/x.png" });
  });

  it("memoizes by path (one RPC call, one blob URL)", async () => {
    gitlabAsset.mockResolvedValue({ base64: btoa("x"), contentType: "image/png" });
    const a = await resolveAsset("/same");
    const b = await resolveAsset("/same");
    expect(a).toBe(b);
    expect(gitlabAsset).toHaveBeenCalledTimes(1);
  });
});
