import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { getSnapshot, getHostActions } from './app/bridge'
import { fetchIssue } from './gitlab/issues'
import { fetchMergeRequest } from './gitlab/mergeRequests'

const APP_CURRENT_URI = 'lumen://app/current'

// The {iid} template segment matches any non-slash text, so (unlike the tool
// layer's iidParam) the resource boundary must validate it. This also guards
// the greedy {+projectPath} match: a stray trailing segment lands in iid, and a
// numeric check rejects it with a clear message instead of a confused GitLab miss.
const NUMERIC_IID = /^\d+$/

/** Wrap a value as a single JSON resource content entry for the given URI. */
function jsonResource(uri: string, value: unknown): ReadResourceResult {
  return {
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }],
  }
}

/**
 * Resources Lumen exposes to MCP clients.
 *
 * Using the SDK's `registerResource` wires up `resources/list`,
 * `resources/templates/list`, and `resources/read` in one shot — which also
 * fixes the original `-32601 Method not found` on resource discovery, since
 * those handlers only exist once at least one resource is registered.
 *
 * Three resources, each addressable as context a client can attach:
 *  - `lumen://app/current` — live app/UI state (what the user is looking at).
 *    This is the one thing only Lumen knows; a stateless tool query can't
 *    express it. Mirrors `lumen_app_state`.
 *  - `lumen://issue/{+projectPath}/{iid}` — a GitLab issue as a document.
 *  - `lumen://mr/{+projectPath}/{iid}` — a GitLab merge request as a document.
 *
 * The issue/MR templates use the RFC 6570 reserved operator `{+projectPath}` so
 * a multi-segment GitLab path (e.g. `group/subgroup/repo`) matches; the trailing
 * numeric `{iid}` is a single path segment, so the greedy path capture stops
 * before it. Both pass `list: undefined` — enumerating every issue/MR is
 * unbounded, so they advertise the URI shape via templates rather than a flat list.
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    'app-current',
    APP_CURRENT_URI,
    {
      title: 'Current Lumen view',
      description:
        "The main window's current route/view/project and selected issues, plus every open native window. Mirrors lumen_app_state; snapshot is null until the app reports once.",
      mimeType: 'application/json',
    },
    async (uri) => {
      // `windows: []` is ambiguous between "no windows open" and "host bridge
      // not yet injected" (pre-boot/headless) — same as lumen_app_state. A null
      // snapshot is the clearer "app hasn't reported yet" signal.
      const host = getHostActions()
      return jsonResource(uri.toString(), {
        snapshot: getSnapshot(),
        windows: host ? host.listWindows() : [],
      })
    },
  )

  server.registerResource(
    'issue',
    new ResourceTemplate('lumen://issue/{+projectPath}/{iid}', { list: undefined }),
    {
      title: 'GitLab issue',
      description:
        'A single issue (description, labels, assignees, milestone, comments) by project path and iid. Example: lumen://issue/group/repo/42',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const project = String(variables.projectPath)
      const iid = String(variables.iid)
      if (!NUMERIC_IID.test(iid)) throw new Error(`Invalid issue iid "${iid}" — must be numeric.`)
      const issue = await fetchIssue(project, iid)
      if (!issue) throw new Error(`Issue ${iid} not found in ${project}.`)
      return jsonResource(uri.toString(), issue)
    },
  )

  server.registerResource(
    'merge-request',
    new ResourceTemplate('lumen://mr/{+projectPath}/{iid}', { list: undefined }),
    {
      title: 'GitLab merge request',
      description:
        'A single merge request (description, diff stats, approvals, comments) by project path and iid. Example: lumen://mr/group/repo/7',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const project = String(variables.projectPath)
      const iid = String(variables.iid)
      if (!NUMERIC_IID.test(iid)) throw new Error(`Invalid MR iid "${iid}" — must be numeric.`)
      const mr = await fetchMergeRequest(project, iid)
      if (!mr) throw new Error(`MR ${iid} not found in ${project}.`)
      return jsonResource(uri.toString(), mr)
    },
  )
}
