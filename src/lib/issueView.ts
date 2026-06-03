// Client-side sort + grouping for the issue workspace. We do this on the loaded
// set (the list infinitely-loads every page) rather than server-side, because
// priority and workflow status live in scoped labels — GitLab can't sort or
// group by them, but we can. Pure functions, easy to test.
import type { IssueListItem } from "@/composables/useIssues";
import { priorityOf, statusOf, parseLabel } from "./labels";

export interface LabelNode {
  id: string;
  title: string;
  color: string;
}

export type SortKey = "priority" | "title" | "updated" | "created";
export type GroupKey = "none" | "status" | "priority" | "assignee";

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "updated", label: "Recently updated" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title" },
  { value: "created", label: "Recently created" },
];

export const GROUPS: { value: GroupKey; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
];

const labelsOf = (i: IssueListItem) =>
  i.labels?.nodes?.filter((l): l is NonNullable<typeof l> => !!l) ?? [];

const firstAssignee = (i: IssueListItem) =>
  i.assignees?.nodes?.filter((a): a is NonNullable<typeof a> => !!a)[0] ?? null;

/** Stable sort by the chosen key. `updated` keeps the server's UPDATED_DESC order. */
export function sortIssues(
  issues: readonly IssueListItem[],
  key: SortKey,
): IssueListItem[] {
  const arr = [...issues];
  if (key === "title")
    return arr.sort((a, b) => a.title.localeCompare(b.title));
  if (key === "priority") {
    const rank = (i: IssueListItem) => priorityOf(labelsOf(i))?.weight ?? 0;
    // Higher weight first; ties keep incoming (updated) order via index fallback.
    return arr
      .map((issue, i) => ({ issue, i }))
      .sort((a, b) => rank(b.issue) - rank(a.issue) || a.i - b.i)
      .map((x) => x.issue);
  }
  if (key === "created") {
    return arr.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  return arr;
}

export interface IssueGroup {
  key: string;
  label: string;
  /** Optional accent color (status/priority groups). */
  color?: string;
  /** Representative label for the column's value — the drop target when retagging. */
  repLabel?: LabelNode;
  issues: IssueListItem[];
}

// Preferred left-to-right / top-to-bottom ordering for known workflow statuses.
const STATUS_ORDER = ["on-deck", "blocked", "in-progress", "in-review", "done"];
const statusRank = (value: string) => {
  const i = STATUS_ORDER.indexOf(value.toLowerCase());
  return i === -1 ? STATUS_ORDER.length : i;
};

function groupByStatus(issues: readonly IssueListItem[]): IssueGroup[] {
  const map = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const s = statusOf(labelsOf(issue));
    const key = s ? s.value : "__none";
    if (!map.has(key))
      map.set(key, {
        key,
        label: s ? s.value : "No status",
        color: s?.color,
        issues: [],
      });
    map.get(key)!.issues.push(issue);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === "__none") return 1;
    if (b.key === "__none") return -1;
    return statusRank(a.label) - statusRank(b.label);
  });
}

function groupByPriority(issues: readonly IssueListItem[]): IssueGroup[] {
  const order = ["critical", "fasttrack", "high", "medium", "low", "__none"];
  const map = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const p = priorityOf(labelsOf(issue));
    const key = p ? p.level : "__none";
    if (!map.has(key))
      map.set(key, {
        key,
        label: p ? p.label : "No priority",
        color: p?.color,
        issues: [],
      });
    map.get(key)!.issues.push(issue);
  }
  return [...map.values()].sort(
    (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
  );
}

function groupByAssignee(issues: readonly IssueListItem[]): IssueGroup[] {
  const map = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const a = firstAssignee(issue);
    const key = a ? a.username : "__none";
    if (!map.has(key))
      map.set(key, { key, label: a ? a.username : "Unassigned", issues: [] });
    map.get(key)!.issues.push(issue);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === "__none") return 1;
    if (b.key === "__none") return -1;
    return a.label.localeCompare(b.label);
  });
}

export function groupIssues(
  issues: readonly IssueListItem[],
  key: GroupKey,
): IssueGroup[] {
  switch (key) {
    case "status":
      return groupByStatus(issues);
    case "priority":
      return groupByPriority(issues);
    case "assignee":
      return groupByAssignee(issues);
    default:
      return [{ key: "all", label: "", issues: [...issues] }];
  }
}

// --- board: group by any scoped-label group --------------------------------

const scopeOf = (l: LabelNode) =>
  parseLabel(l.title, l.color).scope?.toLowerCase() ?? null;
const valueOf = (l: LabelNode) => parseLabel(l.title, l.color).value;

/** Distinct label scopes in a label set, preferred ones first. */
export function labelScopes(labels: readonly LabelNode[]): string[] {
  const set = new Set<string>();
  for (const l of labels) {
    const s = scopeOf(l);
    if (s) set.add(s);
  }
  const preferred = ["assigned", "priority", "team", "type"];
  return [...set].sort((a, b) => {
    const ia = preferred.indexOf(a);
    const ib = preferred.indexOf(b);
    if (ia !== -1 || ib !== -1)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
}

/** Distinct label scopes present across the issues, preferred ones first. */
export function availableScopes(issues: readonly IssueListItem[]): string[] {
  return labelScopes(issues.flatMap((i) => labelsOf(i)));
}

const priorityRank = (label: string) =>
  ["critical", "fasttrack", "high", "medium", "low"].indexOf(
    label
      .toLowerCase()
      .replace(" priority", "")
      .replace(/[\s_-]/g, ""),
  );

/**
 * Columns for the board: one per distinct value of `scope`, plus a "No …" column.
 * When `catalog` (all project labels) is given, every label in the scope gets a
 * column even if no loaded issue uses it yet — so empty columns are draggable into.
 */
export function groupByScope(
  issues: readonly IssueListItem[],
  scope: string,
  catalog?: readonly LabelNode[],
): IssueGroup[] {
  const s = scope.toLowerCase();
  const map = new Map<string, IssueGroup>();
  // Seed empty columns from the full label catalog first.
  if (catalog)
    for (const l of catalog) {
      if (scopeOf(l) !== s) continue;
      const value = valueOf(l);
      if (!map.has(value))
        map.set(value, {
          key: value,
          label: value,
          color: l.color,
          repLabel: { id: l.id, title: l.title, color: l.color },
          issues: [],
        });
    }
  for (const issue of issues) {
    const match = labelsOf(issue).find((l) => scopeOf(l) === s);
    const value = match ? valueOf(match) : null;
    const key = value ?? "__none";
    if (!map.has(key))
      map.set(key, {
        key,
        label: value ?? `No ${scope}`,
        color: match?.color,
        repLabel: match
          ? { id: match.id, title: match.title, color: match.color }
          : undefined,
        issues: [],
      });
    map.get(key)!.issues.push(issue);
  }
  const known =
    s === "assigned" || s === "workflow" || s === "status"
      ? (a: IssueGroup, b: IssueGroup) =>
          statusRank(a.label) - statusRank(b.label)
      : s === "priority"
        ? (a: IssueGroup, b: IssueGroup) =>
            priorityRank(a.label) - priorityRank(b.label)
        : (a: IssueGroup, b: IssueGroup) => a.label.localeCompare(b.label);
  return [...map.values()].sort((a, b) => {
    if (a.key === "__none") return 1;
    if (b.key === "__none") return -1;
    return known(a, b);
  });
}

/**
 * Plan a drag-to-retag: move `issue` into the column whose label is `target`
 * (or out of the scope entirely when `target` is null). Returns the label id
 * deltas and the optimistic next-labels, or null when it's already there.
 * GitLab enforces scoped-label exclusivity, but we remove the old id too so the
 * optimistic cache update is correct immediately.
 */
export function planRetag(
  issue: IssueListItem,
  scope: string,
  target: LabelNode | null,
): {
  addLabelIds: string[];
  removeLabelIds: string[];
  nextLabels: LabelNode[];
} | null {
  const s = scope.toLowerCase();
  const labs: LabelNode[] = labelsOf(issue).map((l) => ({
    id: l.id,
    title: l.title,
    color: l.color,
  }));
  const current = labs.find((l) => scopeOf(l) === s) ?? null;
  if ((target && current && current.id === target.id) || (!target && !current))
    return null;
  return {
    removeLabelIds: current ? [current.id] : [],
    addLabelIds: target ? [target.id] : [],
    nextLabels: [
      ...labs.filter((l) => l.id !== current?.id),
      ...(target ? [target] : []),
    ],
  };
}

// --- active filters ---------------------------------------------------------

/**
 * Every clickable facet reduces to either a label filter or an assignee filter,
 * so the server query (labelName / assigneeUsernames) needs no new variables.
 */
export type Facet =
  | { kind: "label"; value: string; color: string }
  | { kind: "assignee"; value: string };
