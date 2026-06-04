import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, clearConfig } from "./config";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lumen-cfg-"));
  process.env.LUMEN_CONFIG_DIR = dir;
  delete process.env.GITLAB_URL;
  delete process.env.GITLAB_TOKEN;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.LUMEN_CONFIG_DIR;
});

describe("config", () => {
  it("reports unconfigured when no file and no env", () => {
    expect(loadConfig()).toEqual({ gitlabUrl: null, token: null });
  });

  it("imports from env on first run when no file exists", () => {
    process.env.GITLAB_URL = "https://gl.example.com/";
    process.env.GITLAB_TOKEN = "glpat-abc";
    expect(loadConfig()).toEqual({ gitlabUrl: "https://gl.example.com", token: "glpat-abc" });
  });

  it("round-trips saved config and prefers file over env", () => {
    process.env.GITLAB_URL = "https://env.example.com";
    process.env.GITLAB_TOKEN = "glpat-env";
    saveConfig({ url: "https://saved.example.com/", token: "glpat-saved" });
    expect(loadConfig()).toEqual({ gitlabUrl: "https://saved.example.com", token: "glpat-saved" });
  });

  it("clearConfig removes the saved file", () => {
    saveConfig({ url: "https://x.example.com", token: "t" });
    clearConfig();
    expect(loadConfig()).toEqual({ gitlabUrl: null, token: null });
  });
});
