import { nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { withViewTransition } from '@/shared/lib/viewTransition'

// Tab-style hops between a project's surfaces (issues ⇄ pipelines) morph the
// shared repo title and cross-fade the rest. Modified clicks fall through to the
// real href so "open in new window" still works.
export function useTabNav() {
  const router = useRouter()
  function onTabNav(e: MouseEvent, to: Parameters<typeof router.push>[0]) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    withViewTransition(async () => {
      await router.push(to)
      await nextTick()
    })
  }
  return { onTabNav }
}
