import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { rpc } from '@/shared/lib/rpc'

// The configured GitLab base URL (e.g. https://gitlab.example.com). GraphQL
// pipeline nodes expose only a relative `path`, so links to the web UI need the
// host prefix. Cached effectively forever — it only changes via Settings, which
// reloads the app.
export function useGitlabUrl() {
  const query = useQuery<string | null>({
    queryKey: ['config', 'url'],
    queryFn: async () => (await rpc.getConfig()).url,
    staleTime: Infinity,
  })

  const baseUrl = computed(() => query.data.value?.replace(/\/+$/, '') ?? null)

  // Absolutize a relative GitLab path against the configured host. Returns null
  // when either piece is missing so callers can disable the link.
  const toAbsolute = (path: string | null | undefined): string | null =>
    baseUrl.value && path ? `${baseUrl.value}${path}` : null

  return { baseUrl, toAbsolute }
}
