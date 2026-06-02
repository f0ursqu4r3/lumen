import { describe, it, expect } from "vitest";
import { useConfirm, confirmState } from "./useConfirm";

describe("useConfirm", () => {
  it("opens with the given copy and resolves true on accept", async () => {
    const { confirm } = useConfirm();
    const p = confirm({ title: "Discard?", description: "Unsaved changes" });
    expect(confirmState.open).toBe(true);
    expect(confirmState.title).toBe("Discard?");
    confirmState.resolve?.(true);
    await expect(p).resolves.toBe(true);
    expect(confirmState.open).toBe(false);
  });

  it("resolves false on cancel", async () => {
    const { confirm } = useConfirm();
    const p = confirm({ title: "Discard?" });
    confirmState.resolve?.(false);
    await expect(p).resolves.toBe(false);
  });
});
