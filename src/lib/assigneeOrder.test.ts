import { describe, it, expect } from "vitest";
import { orderAssignees } from "./assigneeOrder";

const m = (username: string, name = username) => ({
  username,
  name,
  avatarUrl: null,
});

describe("orderAssignees", () => {
  it("orders groups: originator, assignees, commenters, members", () => {
    const out = orderAssignees({
      author: m("rita"),
      assignees: [m("ada")],
      noteAuthors: [m("cory")],
      members: [m("ada"), m("cory"), m("dee")],
    });
    expect(out.map((p) => p.username)).toEqual(["rita", "ada", "cory", "dee"]);
    expect(out.map((p) => p.relationship)).toEqual([
      "originator",
      "assignee",
      "commenter",
      "member",
    ]);
  });

  it("dedups a person to their highest-priority group", () => {
    const out = orderAssignees({
      author: m("ada"),
      assignees: [m("ada")],
      noteAuthors: [m("ada")],
      members: [m("ada")],
    });
    expect(out).toHaveLength(1);
    expect(out[0].relationship).toBe("originator");
    expect(out[0].isAssigned).toBe(true);
  });

  it("flags current assignees with isAssigned regardless of group", () => {
    const out = orderAssignees({
      author: m("ada"),
      assignees: [m("ada")],
      noteAuthors: [],
      members: [m("dee")],
    });
    const byUsername = Object.fromEntries(out.map((p) => [p.username, p]));
    expect(byUsername.ada.isAssigned).toBe(true);
    expect(byUsername.dee.isAssigned).toBe(false);
  });

  it("keeps caller-supplied note-author order (most recent first)", () => {
    const out = orderAssignees({
      author: null,
      assignees: [],
      noteAuthors: [m("cory"), m("dee")],
      members: [],
    });
    expect(out.map((p) => p.username)).toEqual(["cory", "dee"]);
  });

  it("handles empty author / assignees / notes", () => {
    const out = orderAssignees({
      author: null,
      assignees: [],
      noteAuthors: [],
      members: [m("dee")],
    });
    expect(out.map((p) => p.username)).toEqual(["dee"]);
  });

  it("normalizes missing name to null", () => {
    const out = orderAssignees({
      author: { username: "rita", avatarUrl: null },
      assignees: [],
      noteAuthors: [],
      members: [],
    });
    expect(out[0].name).toBeNull();
  });

  it("deduplicates within a single group", () => {
    const out = orderAssignees({
      author: null,
      assignees: [],
      noteAuthors: [],
      members: [m("dee"), m("dee")],
    });
    expect(out).toHaveLength(1);
  });
});
