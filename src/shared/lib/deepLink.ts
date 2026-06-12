import { FILTER_KEYS } from './issueFilterKeys'

/** A validated intent parsed from a lumen:// URL. `focus` means "just bring the app forward". */
export type DeepLinkIntent =
  | { kind: 'issue'; project: string; iid: string }
  | { kind: 'issues'; project: string; query: Record<string, string | string[]> }
  | { kind: 'focus' }

/** A vue-router location for the issues list route. */
export interface IssuesLocation {
  name: 'issues'
  params: { fullPath: string }
  query: Record<string, string | string[]>
}

const FOCUS: DeepLinkIntent = { kind: 'focus' }
const NUMERIC = /^\d+$/
const SEGMENT = /^[A-Za-z0-9._-]+$/
const FILTER_KEY_LIST: readonly string[] = FILTER_KEYS
const MAX_VALUE_LEN = 200
const MAX_ARRAY = 20

/** Join project path segments, or null if any segment is unsafe (charset / traversal). */
function cleanProject(segments: string[]): string | null {
  if (!segments.length) return null
  for (const s of segments) {
    if (!SEGMENT.test(s) || s.startsWith('.')) return null
  }
  return segments.join('/')
}

/** Pick only known filter keys from the query, capping value length and array size. */
function pickFilters(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const key of FILTER_KEY_LIST) {
    const values = params
      .getAll(key)
      .filter((v) => v.length > 0 && v.length <= MAX_VALUE_LEN)
      .slice(0, MAX_ARRAY)
    if (!values.length) continue
    out[key] = values.length === 1 ? values[0] : values
  }
  return out
}

/**
 * Parse a lumen:// URL into a validated intent. Never throws: any malformed, unknown,
 * or unsafe input collapses to { kind: 'focus' }. This is the deep-link trust boundary.
 */
export function parseLumenUrl(raw: string): DeepLinkIntent {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return FOCUS
  }
  if (url.protocol !== 'lumen:') return FOCUS

  const kind = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean)

  if (kind === 'issue') {
    if (segments.length < 2) return FOCUS
    const iid = segments[segments.length - 1]
    if (!NUMERIC.test(iid)) return FOCUS
    const project = cleanProject(segments.slice(0, -1))
    if (!project) return FOCUS
    return { kind: 'issue', project, iid }
  }

  if (kind === 'issues') {
    const project = cleanProject(segments)
    if (!project) return FOCUS
    return { kind: 'issues', project, query: pickFilters(url.searchParams) }
  }

  return FOCUS
}

/** Map a parsed intent to the issues-list router location, or null for a focus intent. */
export function intentToLocation(intent: DeepLinkIntent): IssuesLocation | null {
  if (intent.kind === 'issue') {
    return { name: 'issues', params: { fullPath: intent.project }, query: { issue: intent.iid } }
  }
  if (intent.kind === 'issues') {
    return { name: 'issues', params: { fullPath: intent.project }, query: intent.query }
  }
  return null
}
