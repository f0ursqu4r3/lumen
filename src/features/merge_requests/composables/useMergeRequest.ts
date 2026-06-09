import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { MR_POLL_MS, mrKey } from '@/features/merge_requests/lib/mrView'

const MergeRequestDocument = `
  query MergeRequest($fullPath: ID!, $iid: String!) {
    project(fullPath: $fullPath) {
      mergeRequest(iid: $iid) {
        id iid title state draft conflicts webUrl createdAt updatedAt mergedAt
        descriptionHtml mergeableDiscussionsState
        sourceBranch targetBranch approved approvalsRequired
        author { name username }
        assignees { nodes { name username } }
        reviewers { nodes { name username } }
        labels { nodes { id title color } }
        milestone { id title }
        headPipeline { id status }
        discussions(first: 100) {
          nodes {
            id
            notes(first: 100) {
              nodes { id body bodyHtml system createdAt author { name username } }
            }
          }
        }
      }
    }
  }
`

type UserCore = { name?: string | null; username: string }
type Note = {
  id: string
  body: string
  bodyHtml?: string | null
  system: boolean
  createdAt: string
  author?: UserCore | null
}

export type MergeRequestDetail = {
  id: string
  iid: string
  title: string
  state: string
  draft: boolean
  conflicts: boolean
  webUrl: string
  createdAt: string
  updatedAt: string
  mergedAt?: string | null
  descriptionHtml?: string | null
  mergeableDiscussionsState?: boolean | null
  sourceBranch: string
  targetBranch: string
  approved: boolean
  approvalsRequired?: number | null
  author?: UserCore | null
  assignees?: { nodes?: (UserCore | null)[] | null } | null
  reviewers?: { nodes?: (UserCore | null)[] | null } | null
  labels?: { nodes?: ({ id: string; title: string; color: string } | null)[] | null } | null
  milestone?: { id: string; title: string } | null
  headPipeline?: { id: string; status: string } | null
  discussions: {
    nodes?: ({ id: string; notes: { nodes?: (Note | null)[] | null } } | null)[] | null
  }
}

type Result = { project?: { mergeRequest?: MergeRequestDetail | null } | null }

async function fetchMr(fullPath: string, iid: string): Promise<MergeRequestDetail | null> {
  try {
    const data = await gqlClient.request<Result, { fullPath: string; iid: string }>(
      MergeRequestDocument,
      { fullPath, iid },
    )
    return data.project?.mergeRequest ?? null
  } catch (e) {
    throw normalizeError(e)
  }
}

export function useMergeRequest(fullPath: Ref<string>, iid: Ref<string>) {
  return useQuery<MergeRequestDetail | null, GitLabError>({
    queryKey: computed(() => mrKey(fullPath.value, iid.value)),
    queryFn: () => fetchMr(fullPath.value, iid.value),
    refetchInterval: MR_POLL_MS,
    refetchOnWindowFocus: true,
  })
}
