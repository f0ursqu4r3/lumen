import { ref, type Ref } from 'vue'
import { rpc } from '@/shared/lib/rpc'

type IssueLike = { iid: string; title: string; webUrl: string } | null | undefined

export function useIssueLinks(issue: Ref<IssueLike>) {
  const linkCopied = ref<null | 'url' | 'md'>(null)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  async function openInGitLab() {
    if (issue.value) await rpc.openExternal({ url: issue.value.webUrl })
  }

  async function onCopyClick(e: MouseEvent) {
    if (!issue.value) return
    const url = issue.value.webUrl
    const markdown = e.shiftKey
    const text = markdown ? `[#${issue.value.iid} ${issue.value.title}](${url})` : url
    // navigator.clipboard is undefined under the views:// origin; write via the host.
    await rpc.clipboardWriteText({ text })
    linkCopied.value = markdown ? 'md' : 'url'
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (linkCopied.value = null), 1400)
  }

  return { linkCopied, onCopyClick, openInGitLab }
}
