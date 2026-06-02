export type Relationship = "originator" | "assignee" | "commenter" | "member";

export interface Person {
  username: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface OrderedPerson extends Person {
  name: string | null;
  avatarUrl: string | null;
  relationship: Relationship;
  isAssigned: boolean;
}

/**
 * Order project-related people into relationship groups, deduping each person
 * to the highest-priority group they qualify for. Keyed by username throughout
 * (author and note authors have no id). `noteAuthors` must be pre-sorted
 * most-recent-first and pre-filtered of system notes by the caller.
 */
export function orderAssignees(input: {
  author?: Person | null;
  assignees: Person[];
  noteAuthors: Person[];
  members: Person[];
}): OrderedPerson[] {
  const assigned = new Set(input.assignees.map((a) => a.username));
  const seen = new Set<string>();
  const out: OrderedPerson[] = [];

  const push = (p: Person | null | undefined, relationship: Relationship) => {
    if (!p?.username || seen.has(p.username)) return;
    seen.add(p.username);
    out.push({
      username: p.username,
      name: p.name ?? null,
      avatarUrl: p.avatarUrl ?? null,
      relationship,
      isAssigned: assigned.has(p.username),
    });
  };

  push(input.author, "originator");
  input.assignees.forEach((a) => push(a, "assignee"));
  input.noteAuthors.forEach((n) => push(n, "commenter"));
  input.members.forEach((mb) => push(mb, "member"));

  return out;
}
