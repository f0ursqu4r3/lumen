import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { PIPELINE_POLL_MS, pipelinesKey, sortPipelines } from '@/gitlab/pipelineParams'

// CI pipelines for a project. Like the issues list this rides a polling cadence
// (GitLab exposes no project-level pipeline subscription over our request/
// response RPC), so it refetches on PIPELINE_POLL_MS and on window focus to stay
// "live". Raw query string (not the typed graphql() wrapper) so the feature
// doesn't require re-running codegen against the live instance.
const PIPELINES_QUERY = `
  query Pipelines($fullPath: ID!, $first: Int!) {
    project(fullPath: $fullPath) {
      pipelines(first: $first) {
        nodes {
          id
          iid
          status
          source
          ref
          sha
          path
          createdAt
          updatedAt
          finishedAt
          duration
          user {
            name
            username
            avatarUrl
          }
          stages {
            nodes {
              id
              name
              status
              jobs {
                nodes {
                  id
                  name
                  status
                }
              }
            }
          }
        }
      }
    }
  }
`

export interface PipelineUser {
  name: string
  username: string
  avatarUrl: string | null
}

/** A single CI job within a stage (e.g. "docker-build"). */
export interface PipelineJob {
  id: string
  name: string
  /** GitLab returns a lowercase string here (e.g. "running", "success"). */
  status: string
}

export interface PipelineStage {
  id: string
  name: string
  /** GitLab returns a lowercase string here (e.g. "running", "success"). */
  status: string
  /** The jobs that ran in this stage, in the order GitLab reports them. */
  jobs: PipelineJob[]
}

export interface Pipeline {
  id: string
  iid: string
  status: string
  source: string | null
  ref: string | null
  sha: string | null
  /** Relative path (e.g. /grp/proj/-/pipelines/42); absolutized for links. */
  path: string | null
  createdAt: string
  updatedAt: string | null
  finishedAt: string | null
  /** Seconds, when finished. */
  duration: number | null
  user: PipelineUser | null
  /** Ordered CI stages (build → test → deploy → …); drives the Stepper. */
  stages: PipelineStage[]
}

// Raw shape from GraphQL: stages (and their jobs) arrive wrapped in connections
// that we flatten into plain arrays.
type RawStage = Omit<PipelineStage, 'jobs'> & {
  jobs: { nodes: (PipelineJob | null)[] } | null
}
type RawPipeline = Omit<Pipeline, 'stages'> & {
  stages: { nodes: (RawStage | null)[] } | null
}

interface PipelinesResult {
  project: { pipelines: { nodes: (RawPipeline | null)[] } | null } | null
}

async function fetchPipelines(fullPath: string): Promise<Pipeline[]> {
  try {
    const data = await gqlClient.request<PipelinesResult, { fullPath: string; first: number }>(
      PIPELINES_QUERY,
      { fullPath, first: 20 },
    )
    const nodes = data.project?.pipelines?.nodes ?? []
    return nodes
      .filter((n): n is RawPipeline => !!n)
      .map((n) => ({
        ...n,
        stages: (n.stages?.nodes ?? [])
          .filter((s): s is RawStage => !!s)
          .map((s) => ({
            ...s,
            jobs: (s.jobs?.nodes ?? []).filter((j): j is PipelineJob => !!j),
          })),
      }))
  } catch (e) {
    throw normalizeError(e)
  }
}

export function usePipelines(fullPath: Ref<string>) {
  const query = useQuery<Pipeline[], GitLabError>({
    queryKey: computed(() => pipelinesKey(fullPath.value)),
    queryFn: () => fetchPipelines(fullPath.value),
    // Running-first, newest-first — the order the view and notifications expect.
    select: sortPipelines,
    refetchInterval: PIPELINE_POLL_MS,
    refetchOnWindowFocus: true,
  })

  const pipelines = computed(() => query.data.value ?? [])
  return Object.assign(query, { pipelines })
}
