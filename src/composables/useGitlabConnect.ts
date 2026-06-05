import { computed, ref } from 'vue'
import { rpc } from '@/lib/rpc'

export type ConnectStatus = 'idle' | 'testing' | 'error'

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
      const res = await rpc.gitlabGraphql({ query: '{ currentUser { username } }' })
      if (res.status === 200 && !res.errors?.length) {
        status.value = 'idle'
        return true
      }
      status.value = 'error'
      message.value = res.errors?.[0]?.message ?? `GitLab returned ${res.status}`
      return false
    } catch (e) {
      status.value = 'error'
      message.value = e instanceof Error ? e.message : 'Could not reach GitLab'
      return false
    }
  }

  return { url, token, status, message, testing, canSubmit, loadUrl, save }
}
