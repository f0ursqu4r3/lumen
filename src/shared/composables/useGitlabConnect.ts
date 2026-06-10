import { computed, ref } from 'vue'
import { rpc } from '@/shared/lib/rpc'
import { PROBE_QUERY } from '@/shared/lib/gitlabQueries'

export type ConnectStatus = 'idle' | 'testing' | 'error'

export { PROBE_QUERY }

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
export function useGitlabConnect(opts: { allowExistingToken?: boolean } = {}) {
  const url = ref('')
  const token = ref('')
  const tokenSuffix = ref<string | null>(null)
  const status = ref<ConnectStatus>('idle')
  const message = ref('')

  const testing = computed(() => status.value === 'testing')
  const canSubmit = computed(
    () =>
      !testing.value &&
      url.value.trim().length > 0 &&
      (token.value.trim().length > 0 || (opts.allowExistingToken && !!tokenSuffix.value)),
  )
  const tokenPlaceholder = computed(() =>
    tokenSuffix.value ? `Current token ends …${tokenSuffix.value}` : 'glpat-…',
  )

  /** Prefill the URL from persisted config so re-running connect doesn't retype it. */
  async function loadUrl() {
    const cfg = await rpc.getConfig()
    if (cfg.url) url.value = cfg.url
    tokenSuffix.value = cfg.tokenSuffix
  }

  async function save(): Promise<boolean> {
    if (!canSubmit.value) return false
    status.value = 'testing'
    message.value = ''
    const trimmedToken = token.value.trim()
    try {
      await rpc.saveConfig({
        url: url.value.trim(),
        ...(trimmedToken ? { token: trimmedToken } : {}),
      })
      const res = await rpc.gitlabGraphql({ query: PROBE_QUERY })
      if (res.status === 200 && !res.errors?.length) {
        status.value = 'idle'
        if (trimmedToken) tokenSuffix.value = trimmedToken.slice(-6)
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

  return {
    url,
    token,
    tokenSuffix,
    tokenPlaceholder,
    status,
    message,
    testing,
    canSubmit,
    loadUrl,
    save,
  }
}
