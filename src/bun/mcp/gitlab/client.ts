import { gitlabGraphql, gitlabRest } from '../../gitlab'

/** Run a GraphQL operation, mapping transport/auth errors like src/gitlab/errors.ts. */
export async function gql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await gitlabGraphql({ query, variables })
  if (res.status === 401 || (res.status === 403 && res.errors?.length)) {
    throw new Error('GitLab authentication failed — check the token (scope: api).')
  }
  if (res.status === 403 || res.status >= 500) {
    throw new Error('GitLab is unavailable.')
  }
  if (res.errors?.length) throw new Error(res.errors[0].message)
  return res.data as T
}

/** Run a REST call (method + `/v4`-prefixed path); throw on non-ok. */
export async function rest(method: 'GET' | 'POST', path: string): Promise<void> {
  const res = await gitlabRest({ method, path })
  if (!res.ok)
    throw new Error(`GitLab request failed (${res.status} ${res.statusText || 'error'}).`)
}

const LABELS_Q = `query($p:ID!,$s:String){project(fullPath:$p){labels(searchTerm:$s,first:50,includeAncestorGroups:true){nodes{id title}}}}`
const MEMBERS_Q = `query($p:ID!,$s:String){project(fullPath:$p){projectMembers(search:$s,first:50){nodes{user{id username}}}}}`
const MILESTONES_Q = `query($p:ID!,$s:String){project(fullPath:$p){milestones(searchTitle:$s,first:50){nodes{id title}}}}`

/** Resolve label titles → label GlobalIDs for the given project. Throws if any title is unknown. */
export async function resolveLabelIds(fullPath: string, titles: string[]): Promise<string[]> {
  if (titles.length === 0) return []
  const data = await gql<{
    project: { labels: { nodes: { id: string; title: string }[] } } | null
  }>(LABELS_Q, { p: fullPath, s: null })
  const byTitle = new Map((data.project?.labels.nodes ?? []).map((l) => [l.title, l.id]))
  return titles.map((t) => {
    const id = byTitle.get(t)
    if (!id) throw new Error(`Unknown label: "${t}"`)
    return id
  })
}

/** Resolve usernames → user GlobalIDs for the given project. Throws if any username is unknown. */
export async function resolveUserIds(fullPath: string, usernames: string[]): Promise<string[]> {
  if (usernames.length === 0) return []
  const data = await gql<{
    project: {
      projectMembers: { nodes: { user: { id: string; username: string } | null }[] }
    } | null
  }>(MEMBERS_Q, { p: fullPath, s: null })
  const byName = new Map(
    (data.project?.projectMembers.nodes ?? [])
      .map((n) => n.user)
      .filter((u): u is { id: string; username: string } => Boolean(u))
      .map((u) => [u.username, u.id]),
  )
  return usernames.map((u) => {
    const id = byName.get(u)
    if (!id) throw new Error(`Unknown project member: "${u}"`)
    return id
  })
}

/** Resolve a milestone title → its GlobalID for the given project. Throws if unknown. */
export async function resolveMilestoneId(fullPath: string, title: string): Promise<string> {
  const data = await gql<{
    project: { milestones: { nodes: { id: string; title: string }[] } } | null
  }>(MILESTONES_Q, { p: fullPath, s: title })
  const found = (data.project?.milestones.nodes ?? []).find((m) => m.title === title)
  if (!found) throw new Error(`Unknown milestone: "${title}"`)
  return found.id
}
