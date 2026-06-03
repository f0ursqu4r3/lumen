export type Relationship = 'originator' | 'assignee' | 'commenter' | 'member'

export interface Person {
  username: string
  name?: string | null
  avatarUrl?: string | null
}

export interface OrderedPerson extends Person {
  name: string | null
  avatarUrl: string | null
  relationship: Relationship
  isAssigned: boolean
}

/**
 * Order project-related people into relationship groups, deduping each person
 * to the highest-priority group they qualify for. Keyed by username throughout
 * (author and note authors have no id). `noteAuthors` must be pre-sorted
 * most-recent-first and pre-filtered of system notes by the caller.
 */
export function orderAssignees(input: {
  author?: Person | null
  assignees: Person[]
  noteAuthors: Person[]
  members: Person[]
}): OrderedPerson[] {
  const assigned = new Set(input.assignees.map((a) => a.username))
  const seen = new Set<string>()
  const out: OrderedPerson[] = []

  const push = (p: Person | null | undefined, relationship: Relationship) => {
    if (!p?.username || seen.has(p.username)) return
    seen.add(p.username)
    out.push({
      username: p.username,
      name: p.name ?? null,
      avatarUrl: p.avatarUrl ?? null,
      relationship,
      isAssigned: assigned.has(p.username),
    })
  }

  push(input.author, 'originator')
  input.assignees.forEach((a) => push(a, 'assignee'))
  input.noteAuthors.forEach((n) => push(n, 'commenter'))
  input.members.forEach((mb) => push(mb, 'member'))

  return out
}

export interface AssigneeSection {
  rel: Relationship
  label: string
  people: OrderedPerson[]
}

export interface AssigneeView {
  assignees: Person[]
  sections: AssigneeSection[]
}

type IssueLike = {
  author?: Person | null
  assignees?: { nodes?: (Person | null)[] | null } | null
  notes?: {
    nodes?:
      | ({
          system?: boolean | null
          createdAt: string
          author?: Person | null
        } | null)[]
      | null
  } | null
}

const SECTION_LABEL: Record<Relationship, string> = {
  originator: 'Reporter',
  assignee: 'Assigned',
  commenter: 'Commented',
  member: 'Project members',
}
const SECTION_ORDER: Relationship[] = ['originator', 'assignee', 'commenter', 'member']

/**
 * Derive the current assignees and the relationship-grouped, labelled sections
 * for an issue, so the assignee editor and quick-assign share one ordering.
 * `issue` is accepted structurally to keep this module free of generated types.
 */
export function assigneeSections(issue: IssueLike, members: Person[]): AssigneeView {
  const assignees = (issue.assignees?.nodes ?? []).filter((a): a is Person => !!a)
  const noteAuthors = (issue.notes?.nodes ?? [])
    .filter(
      (n): n is { system?: boolean | null; createdAt: string; author: Person } =>
        !!n && !n.system && !!n.author,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((n) => n.author)

  const ordered = orderAssignees({
    author: issue.author ?? null,
    assignees,
    noteAuthors,
    members,
  })

  const sections = SECTION_ORDER.map((rel) => ({
    rel,
    label: SECTION_LABEL[rel],
    people: ordered.filter((p) => p.relationship === rel),
  })).filter((s) => s.people.length)

  return { assignees, sections }
}

export const personInitial = (p: Pick<Person, 'name' | 'username'>): string =>
  (p.name || p.username).charAt(0).toUpperCase()
