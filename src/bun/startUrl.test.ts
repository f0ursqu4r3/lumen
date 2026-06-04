import { describe, it, expect, vi } from "vitest";
import { resolveStartUrl } from "./startUrl";

const VIEWS = "views://mainview/index.html";
const noSleep = () => Promise.resolve();

describe("resolveStartUrl", () => {
  it("loads the bundled views:// app when not in HMR mode, without probing", async () => {
    const probe = vi.fn();
    expect(await resolveStartUrl({ hmr: false, probe })).toBe(VIEWS);
    expect(probe).not.toHaveBeenCalled();
  });

  it("loads the dev server (correct port) when HMR is on and it is up", async () => {
    const probe = vi.fn().mockResolvedValue(true);
    const url = await resolveStartUrl({ hmr: true, probe, sleep: noSleep });
    expect(url).toMatch(/^http:\/\/localhost:\d+\/index\.html$/);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("polls past the vite-startup race, then loads the dev server", async () => {
    const probe = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const url = await resolveStartUrl({ hmr: true, probe, sleep: noSleep, attempts: 10 });
    expect(url).toMatch(/\/index\.html$/);
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it("falls back to views:// if the dev server never comes up", async () => {
    const probe = vi.fn().mockResolvedValue(false);
    const url = await resolveStartUrl({ hmr: true, probe, sleep: noSleep, attempts: 5 });
    expect(url).toBe(VIEWS);
    expect(probe).toHaveBeenCalledTimes(5);
  });
});
