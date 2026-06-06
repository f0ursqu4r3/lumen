import { computed, ref, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from '@/shared/composables/useConfirm'
import { rpc } from '@/shared/lib/rpc'

export function useIssueDrawerRoute(fullPath: Ref<string>) {
  const route = useRoute()
  const router = useRouter()
  const { confirm } = useConfirm()
  const drawerDirty = ref(false)

  // Drawer is driven by ?issue=<iid> on this route, so back/refresh/links all work.
  const openIid = computed(() => {
    const q = route.query.issue
    return typeof q === 'string' && q ? q : null
  })

  async function setDrawerOpen(value: boolean) {
    if (value) return // opening is driven by issue links, not this handler
    if (drawerDirty.value) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        description: "Your edits to this issue haven't been saved.",
      })
      if (!ok) return
    }
    drawerDirty.value = false
    const { issue: _issue, ...rest } = route.query
    router.replace({ query: rest })
  }

  async function expandIssue() {
    if (!openIid.value) return
    if (drawerDirty.value) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        description: "Your edits to this issue haven't been saved.",
      })
      if (!ok) return
    }
    drawerDirty.value = false
    const iid = openIid.value
    // Open (or focus) the issue's own native window. Only once it's open do we
    // leave the list clean — clear ?issue= the same way closing the drawer does.
    // If the host call fails, keep the drawer open so the user can retry.
    try {
      await rpc.openIssueWindow({ fullPath: fullPath.value, iid })
    } catch {
      return
    }
    const { issue: _issue, ...rest } = route.query
    router.replace({ query: rest })
  }

  return { drawerDirty, openIid, setDrawerOpen, expandIssue }
}
