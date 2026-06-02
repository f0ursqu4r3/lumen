// Pure draft/diff logic for buffered issue editing. Kept free of generated types
// (accepts the issue structurally) so it is trivially unit-testable.
export interface IssueDraft {
  title: string;
  description: string;
  state: "opened" | "closed";
  labelIds: string[];
  assigneeUsernames: string[];
}

export function draftFromIssue(issue: {
  title: string;
  description?: string | null;
  state: string;
  labels?: { nodes?: ({ id: string } | null)[] | null } | null;
  assignees?: { nodes?: ({ username: string } | null)[] | null } | null;
}): IssueDraft {
  return {
    title: issue.title,
    description: issue.description ?? "",
    state: issue.state as "opened" | "closed",
    labelIds: (issue.labels?.nodes ?? [])
      .filter((l): l is { id: string } => !!l)
      .map((l) => l.id),
    assigneeUsernames: (issue.assignees?.nodes ?? [])
      .filter((a): a is { username: string } => !!a)
      .map((a) => a.username),
  };
}

const sameSet = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((x) => setA.has(x));
};

export function isDirty(o: IssueDraft, d: IssueDraft): boolean {
  return (
    o.title !== d.title ||
    o.description !== d.description ||
    o.state !== d.state ||
    !sameSet(o.labelIds, d.labelIds) ||
    !sameSet(o.assigneeUsernames, d.assigneeUsernames)
  );
}

export interface IssueEditDiff {
  update?: {
    title?: string;
    description?: string;
    stateEvent?: "CLOSE" | "REOPEN";
    addLabelIds?: string[];
    removeLabelIds?: string[];
  };
  assignees?: string[];
}

export function diffIssueEdit(o: IssueDraft, d: IssueDraft): IssueEditDiff {
  const update: NonNullable<IssueEditDiff["update"]> = {};
  if (o.title !== d.title) update.title = d.title;
  if (o.description !== d.description) update.description = d.description;
  if (o.state !== d.state)
    update.stateEvent = d.state === "closed" ? "CLOSE" : "REOPEN";
  const addLabelIds = d.labelIds.filter((id) => !o.labelIds.includes(id));
  const removeLabelIds = o.labelIds.filter((id) => !d.labelIds.includes(id));
  if (addLabelIds.length) update.addLabelIds = addLabelIds;
  if (removeLabelIds.length) update.removeLabelIds = removeLabelIds;

  const diff: IssueEditDiff = {};
  if (Object.keys(update).length) diff.update = update;
  if (!sameSet(o.assigneeUsernames, d.assigneeUsernames))
    diff.assignees = d.assigneeUsernames;
  return diff;
}
