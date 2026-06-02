import { describe, it, expect } from "vitest";
import {
  sortIssues,
  groupIssues,
  groupByScope,
  availableScopes,
  labelScopes,
  planRetag,
} from "./issueView";
import type { IssueListItem } from "@/composables/useIssues";

// Minimal issue factory — only the fields the view helpers read.
const mk = (
  iid: string,
  title: string,
  labels: { title: string; color: string }[] = [],
  assignees: string[] = [],
): IssueListItem =>
  ({
    iid,
    title,
    state: "opened",
    webUrl: "#",
    labels: { nodes: labels.map((l, i) => ({ id: `${iid}-${i}`, ...l })) },
    assignees: {
      nodes: assignees.map((u) => ({ id: u, username: u, avatarUrl: null })),
    },
  }) as unknown as IssueListItem;

const P = (v: string) => ({ title: `priority::${v}`, color: "#fff" });
const S = (v: string) => ({ title: `assigned::${v}`, color: "#0f0" });

describe("sortIssues", () => {
  const issues = [
    mk("1", "B", [P("Low")]),
    mk("2", "A", [P("High")]),
    mk("3", "C", []),
  ];

  it("orders by priority, high first, no-priority last", () => {
    expect(sortIssues(issues, "priority").map((i) => i.iid)).toEqual([
      "2",
      "1",
      "3",
    ]);
  });

  it("orders by title", () => {
    expect(sortIssues(issues, "title").map((i) => i.title)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("keeps server order for updated", () => {
    expect(sortIssues(issues, "updated").map((i) => i.iid)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
});

describe("groupIssues", () => {
  const issues = [
    mk("1", "a", [S("in-review")]),
    mk("2", "b", [S("on-deck")]),
    mk("3", "c", []),
  ];

  it("returns a single group when ungrouped", () => {
    const g = groupIssues(issues, "none");
    expect(g).toHaveLength(1);
    expect(g[0].issues).toHaveLength(3);
  });

  it("orders status groups by workflow, no-status last", () => {
    expect(groupIssues(issues, "status").map((g) => g.label)).toEqual([
      "on-deck",
      "in-review",
      "No status",
    ]);
  });

  it("groups by priority with a canonical order", () => {
    const pi = [mk("1", "a", [P("Low")]), mk("2", "b", [P("High")])];
    expect(groupIssues(pi, "priority").map((g) => g.label)).toEqual([
      "High priority",
      "Low priority",
    ]);
  });

  it("groups by assignee, unassigned last", () => {
    const ai = [
      mk("1", "a", [], ["zoe"]),
      mk("2", "b", []),
      mk("3", "c", [], ["amy"]),
    ];
    expect(groupIssues(ai, "assignee").map((g) => g.label)).toEqual([
      "amy",
      "zoe",
      "Unassigned",
    ]);
  });
});

describe("availableScopes", () => {
  it("lists distinct scopes with preferred ones first", () => {
    const issues = [
      mk("1", "a", [{ title: "team::HMI", color: "#00f" }, P("High")]),
      mk("2", "b", [S("in-review"), { title: "team::HMI", color: "#00f" }]),
    ];
    expect(availableScopes(issues)).toEqual(["assigned", "priority", "team"]);
  });
});

describe("labelScopes", () => {
  it("reads scopes straight from a label catalog, preferred first", () => {
    const catalog = [
      { id: "1", title: "team::HMI", color: "#00f" },
      { id: "2", title: "assigned::stalled", color: "#888" },
      { id: "3", title: "plain", color: "#111" },
    ];
    expect(labelScopes(catalog)).toEqual(["assigned", "team"]);
  });
});

describe("groupByScope", () => {
  const issues = [
    mk("1", "a", [{ title: "team::HMI", color: "#3b82f6" }]),
    mk("2", "b", [{ title: "team::sensors", color: "#0d9488" }]),
    mk("3", "c", []),
  ];

  it("makes a column per value plus a No-scope column last", () => {
    const cols = groupByScope(issues, "team");
    expect(cols.map((c) => c.label)).toEqual(["HMI", "sensors", "No team"]);
    expect(cols[0].repLabel).toMatchObject({
      title: "team::HMI",
      color: "#3b82f6",
    });
    expect(cols[2].repLabel).toBeUndefined();
  });

  it("orders an assigned scope by workflow", () => {
    const wi = [mk("1", "a", [S("in-review")]), mk("2", "b", [S("on-deck")])];
    expect(groupByScope(wi, "assigned").map((c) => c.label)).toEqual([
      "on-deck",
      "in-review",
    ]);
  });

  it("seeds empty columns from the label catalog", () => {
    const used = [
      mk("1", "a", [{ title: "assigned::on-deck", color: "#0f0" }]),
    ];
    const catalog = [
      { id: "l1", title: "assigned::on-deck", color: "#0f0" },
      { id: "l2", title: "assigned::in-review", color: "#0f0" },
      { id: "l3", title: "assigned::stalled", color: "#888" },
      { id: "l9", title: "team::HMI", color: "#00f" },
    ];
    const cols = groupByScope(used, "assigned", catalog);
    expect(cols.map((c) => c.label)).toEqual([
      "on-deck",
      "in-review",
      "stalled",
    ]);
    expect(cols.find((c) => c.label === "in-review")!.issues).toHaveLength(0);
    expect(cols.find((c) => c.label === "stalled")!.repLabel).toMatchObject({
      id: "l3",
    });
  });
});

describe("planRetag", () => {
  const issue = mk("1", "a", [
    { title: "assigned::on-deck", color: "#0f0" },
    { title: "type::BUG", color: "#f00" },
  ]);
  const target = { id: "1-x", title: "assigned::in-review", color: "#0f0" };

  it("swaps the in-scope label, keeping others", () => {
    const plan = planRetag(issue, "assigned", target)!;
    expect(plan.addLabelIds).toEqual(["1-x"]);
    expect(plan.removeLabelIds).toEqual(["1-0"]);
    expect(plan.nextLabels.map((l) => l.title)).toEqual([
      "type::BUG",
      "assigned::in-review",
    ]);
  });

  it("removes the scope label when dropped on the No-scope column", () => {
    const plan = planRetag(issue, "assigned", null)!;
    expect(plan.addLabelIds).toEqual([]);
    expect(plan.removeLabelIds).toEqual(["1-0"]);
    expect(plan.nextLabels.map((l) => l.title)).toEqual(["type::BUG"]);
  });

  it("returns null when already in the target column", () => {
    const same = { id: "1-0", title: "assigned::on-deck", color: "#0f0" };
    expect(planRetag(issue, "assigned", same)).toBeNull();
  });
});
