import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { pollInterval, pollOnFocus } from '@/shared/lib/polling'
import { ISSUE_POLL_MS, issueKey } from '@/gitlab/issueParams'

const IssueDocument = `
  query Issue($fullPath: ID!, $iid: String!) {
    project(fullPath: $fullPath) {
      issue(iid: $iid) {
        id
        iid
        title
        description
        state
        webUrl
        createdAt
        dueDate
        weight
        confidential
        humanTimeEstimate
        author {
          name
          username
          avatarUrl
        }
        milestone {
          id
          title
        }
        labels {
          nodes {
            id
            title
            color
          }
        }
        assignees {
          nodes {
            id
            name
            username
            avatarUrl
          }
        }
        # Comments grouped by thread: each discussion is one thread whose first
        # note is the comment and any following notes are replies. (GitLab's flat
        # notes field discards this grouping.) Capped, no pagination — fine for a
        # personal tool.
        discussions(first: 100) {
          nodes {
            id
            notes(first: 100) {
              nodes {
                id
                body
                system
                createdAt
                author {
                  name
                  username
                  avatarUrl
                }
              }
            }
          }
        }
      }
    }
  }
`

type UserCore = {
  name: string
  username: string
  avatarUrl?: string | null
}

type LabelNode = { id: string; title: string; color: string }
type AssigneeNode = UserCore & { id: string }
type Note = {
  id: string
  body: string
  system: boolean
  createdAt: string
  author?: UserCore | null
}

type IssueResult = {
  project?: {
    issue?: {
      id: string
      iid: string
      title: string
      description?: string | null
      state: string
      webUrl: string
      createdAt: string
      dueDate?: string | null
      weight?: number | null
      confidential: boolean
      humanTimeEstimate?: string | null
      author: UserCore
      milestone?: { id: string; title: string } | null
      labels?: { nodes?: (LabelNode | null)[] | null } | null
      assignees?: { nodes?: (AssigneeNode | null)[] | null } | null
      discussions: {
        nodes?: ({ id: string; notes: { nodes?: (Note | null)[] | null } } | null)[] | null
      }
    } | null
  } | null
}

async function fetchIssue(fullPath: string, iid: string) {
  try {
    const data = await gqlClient.request<IssueResult, { fullPath: string; iid: string }>(
      IssueDocument,
      { fullPath, iid },
    )
    return data.project?.issue ?? null
  } catch (e) {
    throw normalizeError(e)
  }
}

export type IssueDetail = NonNullable<Awaited<ReturnType<typeof fetchIssue>>>

export function useIssue(fullPath: Ref<string>, iid: Ref<string>) {
  return useQuery<Awaited<ReturnType<typeof fetchIssue>>, GitLabError>({
    queryKey: computed(() => issueKey(fullPath.value, iid.value)),
    queryFn: () => fetchIssue(fullPath.value, iid.value),
    // Polls the open issue (incl. its comments) until per-issue GraphQL
    // subscriptions replace this. Shares the list's cadence.
    refetchInterval: pollInterval(ISSUE_POLL_MS),
    refetchOnWindowFocus: pollOnFocus(),
  })
}
