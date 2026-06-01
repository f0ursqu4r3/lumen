import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { issueKey } from '@/gitlab/issueParams'

const IssueDocument = graphql(`
  query Issue($fullPath: ID!, $iid: String!) {
    project(fullPath: $fullPath) {
      issue(iid: $iid) {
        id
        iid
        title
        description
        state
        webUrl
        milestone { title }
        labels { nodes { id title color } }
        assignees { nodes { id username avatarUrl } }
        notes(first: 100) {
          nodes { id body system createdAt author { username avatarUrl } }
        }
      }
    }
  }
`)

async function fetchIssue(fullPath: string, iid: string) {
  try {
    const data = await gqlClient.request(IssueDocument, { fullPath, iid })
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
  })
}
