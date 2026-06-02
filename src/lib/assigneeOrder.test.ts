import { describe, it, expect } from "vitest";
import { orderAssignees, assigneeSections } from "./assigneeOrder";

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

describe("assigneeSections", () => {
  const issue = {
    author: { username: "rita", name: "Rita", avatarUrl: null },
    assignees: {
      nodes: [{ username: "ada", name: "Ada", avatarUrl: null }, null],
    },
    notes: {
      nodes: [
        {
          system: false,
          createdAt: "2026-01-01T00:00:00Z",
          author: { username: "cory", name: "Cory", avatarUrl: null },
        },
        {
          system: false,
          createdAt: "2026-01-03T00:00:00Z",
          author: { username: "dee", name: "Dee", avatarUrl: null },
        },
        {
          system: true,
          createdAt: "2026-01-04T00:00:00Z",
          author: { username: "bot", name: "Bot", avatarUrl: null },
        },
        null,
      ],
    },
  };
  const members = [
    { username: "ada", name: "Ada", avatarUrl: null },
    { username: "cory", name: "Cory", avatarUrl: null },
    { username: "evan", name: "Evan", avatarUrl: null },
  ];

  it("returns current assignees with nulls filtered", () => {
    const { assignees } = assigneeSections(issue, members);
    expect(assignees.map((a) => a.username)).toEqual(["ada"]);
  });

  it("groups people into labelled, non-empty sections in canonical order", () => {
    const { sections } = assigneeSections(issue, members);
    expect(sections.map((s) => s.label)).toEqual([
      "Reporter",
      "Assigned",
      "Commented",
      "Project members",
    ]);
    // dee commented more recently than cory
    expect(
      sections.find((s) => s.rel === "commenter")!.people.map((p) => p.username),
    ).toEqual(["dee", "cory"]);
    // ada + cory already shown in higher groups; only evan remains
    expect(
      sections.find((s) => s.rel === "member")!.people.map((p) => p.username),
    ).toEqual(["evan"]);
  });

  it("omits empty groups", () => {
    const { sections } = assigneeSections(
      { author: null, assignees: { nodes: [] }, notes: { nodes: [] } },
      [{ username: "evan", name: "Evan", avatarUrl: null }],
    );
    expect(sections.map((s) => s.rel)).toEqual(["member"]);
  });
});
