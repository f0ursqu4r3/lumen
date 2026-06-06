import { computed, ref, type Ref } from 'vue'
import { buildIssueMedia, type MediaNote } from '@/features/issues/composables/useIssueMedia'

export function useIssueMediaViewer(opts: {
  description: Ref<string | undefined>
  notes: Ref<MediaNote[]>
  fullPath: string
}) {
  const media = computed(() =>
    buildIssueMedia(opts.description.value, opts.notes.value, opts.fullPath),
  )
  const viewerOpen = ref(false)
  const viewerIndex = ref(0)

  function openViewer(i: number) {
    viewerIndex.value = i
    viewerOpen.value = true
  }

  // Inline media is rendered via v-html, so intercept clicks by delegation. The
  // clicked trigger's ordinal among all [data-media-trigger] elements in the body
  // is its index in `media`: both follow document order (description then
  // comments) and only images/videos carry the trigger — exactly the collection.
  function onBodyMediaClick(e: MouseEvent) {
    const el = (e.target as HTMLElement | null)?.closest('[data-media-trigger]')
    if (!el) return
    e.preventDefault()
    const triggers = Array.from(
      (e.currentTarget as HTMLElement).querySelectorAll('[data-media-trigger]'),
    )
    const i = triggers.indexOf(el)
    if (i >= 0) openViewer(i)
  }

  return { media, viewerOpen, viewerIndex, openViewer, onBodyMediaClick }
}
