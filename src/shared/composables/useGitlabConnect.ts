import { computed, ref } from 'vue'
import { rpc } from '@/shared/lib/rpc'

export type ConnectStatus = 'idle' | 'testing' | 'error'

/** Cheapest authenticated probe — a clean 200 with no errors proves the token works. */
export const PROBE_QUERY = '{ currentUser { username } }'

/** Map a connect-probe result to a kind-specific, recoverable message. */
function connectErrorMessage(
  statusCode: number,
  errors: { message: string }[] | undefined,
  host: string,
): string {
  if (statusCode === 401 || statusCode === 403) {
    return 'Token rejected — check the token and its `api` scope.'
  }
  if (statusCode >= 500) {
    return `Couldn’t reach ${host || 'GitLab'} — is the server up?`
  }
  return errors?.[0]?.message ?? `GitLab returned ${statusCode}`
}

/**
 * Shared GitLab connect state + probe. `save()` persists the config and probes
 * with the cheapest authenticated query; it sets `status`/`message` and resolves
 * true only on a clean 200 with no GraphQL errors. Callers own the success
 * side-effect (onboarding navigates; the settings dialog toasts).
 */
export function useGitlabConnect() {
  const url = ref('')
  const token = ref('')
  const status = ref<ConnectStatus>('idle')
  const message = ref('')

  const testing = computed(() => status.value === 'testing')
  const canSubmit = computed(
    () => !testing.value && url.value.trim().length > 0 && token.value.trim().length > 0,
  )

  /** Prefill the URL from persisted config so re-running connect doesn't retype it. */
  async function loadUrl() {
    const cfg = await rpc.getConfig()
    if (cfg.url) url.value = cfg.url
  }

  async function save(): Promise<boolean> {
    if (!canSubmit.value) return false
    status.value = 'testing'
    message.value = ''
    try {
      await rpc.saveConfig({ url: url.value.trim(), token: token.value.trim() })
      const res = await rpc.gitlabGraphql({ query: PROBE_QUERY })
      if (res.status === 200 && !res.errors?.length) {
        status.value = 'idle'
        return true
      }
      status.value = 'error'
      message.value = connectErrorMessage(res.status, res.errors, url.value.trim())
      return false
    } catch {
      // A thrown rpc means the host's fetch threw — treat as unreachable, never
      // as a token problem.
      status.value = 'error'
      message.value = `Couldn't reach ${url.value.trim() || 'GitLab'} — is the server up?`
      return false
    }
  }

  return { url, token, status, message, testing, canSubmit, loadUrl, save }
}
