import { describe, it, expect, vi } from "vitest";
import { applyResolvedMedia } from "./media";

describe("applyResolvedMedia", () => {
  it("replaces src/href on every [data-media-src] element with resolved URLs", async () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<img data-media-src="/p/1/uploads/a/x.png" src="/p/1/uploads/a/x.png">' +
      '<a class="file-card" data-media-src="/p/1/uploads/b/y.zip" href="/p/1/uploads/b/y.zip">y</a>';
    const resolve = vi.fn((p: string) => Promise.resolve(`blob:${p}`));
    await applyResolvedMedia(root, resolve);
    expect(root.querySelector("img")!.getAttribute("src")).toBe("blob:/p/1/uploads/a/x.png");
    expect(root.querySelector("a")!.getAttribute("href")).toBe("blob:/p/1/uploads/b/y.zip");
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
