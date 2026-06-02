import { describe, it, expect } from "vitest";
import {
  parseLabel,
  readableText,
  darken,
  priorityOf,
  typeOf,
  statusOf,
  remainingLabels,
} from "./labels";

describe("parseLabel", () => {
  it("splits a scoped label on the final ::", () => {
    expect(parseLabel("priority::High", "#abc")).toMatchObject({
      scope: "priority",
      value: "High",
    });
  });

  it("keeps :: that appears inside the scope", () => {
    expect(parseLabel("fix order::2", "#000")).toMatchObject({
      scope: "fix order",
      value: "2",
    });
  });

  it("treats a plain label as scope-less", () => {
    expect(parseLabel("bug", "#f00")).toMatchObject({
      scope: null,
      value: "bug",
    });
  });
});

describe("readableText", () => {
  it("returns dark text on a light/yellow background", () => {
    expect(readableText("#facc15")).toBe("#1f2328");
  });

  it("returns light text on a dark background", () => {
    expect(readableText("#1d4ed8")).toBe("#ffffff");
  });

  it("handles 3-digit and hash-less hex", () => {
    expect(readableText("fff")).toBe("#1f2328");
    expect(readableText("#000")).toBe("#ffffff");
  });
});

describe("darken", () => {
  it("moves a color toward black", () => {
    expect(darken("#ffffff", 0.5)).toBe("#808080");
  });
});

describe("semantic scopes", () => {
  const labels = [
    { title: "priority::Medium", color: "#facc15" },
    { title: "type::BUG", color: "#ef4444" },
    { title: "assigned::in-review", color: "#16a34a" },
    { title: "team::HMI", color: "#3b82f6" },
  ];

  it("lifts priority with consistent semantics", () => {
    expect(priorityOf(labels)).toMatchObject({
      level: "medium",
      icon: "chevron-up",
    });
  });

  it("maps known type codes to an icon", () => {
    expect(typeOf(labels)).toMatchObject({ code: "BUG", icon: "bug" });
  });

  it("falls back to a tag icon for unknown type codes", () => {
    expect(typeOf([{ title: "type::WAT", color: "#123456" }])).toMatchObject({
      code: "WAT",
      icon: "tag",
    });
  });

  it("finds the workflow status label", () => {
    expect(statusOf(labels)?.value).toBe("in-review");
  });

  it("leaves only non-lifted labels as pills", () => {
    expect(remainingLabels(labels).map((l) => l.title)).toEqual(["team::HMI"]);
  });
});
