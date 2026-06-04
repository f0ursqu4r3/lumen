import { describe, it, expect } from "vitest";
import { makeBuster } from "./persist";

describe("makeBuster", () => {
  it("is stable for the same url", () => {
    expect(makeBuster("https://gl.example.com")).toBe(makeBuster("https://gl.example.com"));
  });
  it("differs across instances so switching clears stale cache", () => {
    expect(makeBuster("https://a.example.com")).not.toBe(makeBuster("https://b.example.com"));
  });
  it("has a stable buster for the unconfigured (null) state", () => {
    expect(makeBuster(null)).toBe(makeBuster(null));
  });
});
