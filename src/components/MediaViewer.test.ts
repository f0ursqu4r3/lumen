import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import MediaViewer from './MediaViewer.vue'
import type { ViewerItem } from '@/composables/useIssueMedia'

const items: ViewerItem[] = [
  { kind: 'image', src: '/a.png', href: '/a.png', alt: 'A', title: '', source: 'description', caption: 'A' },
  { kind: 'video', src: '/b.mp4', href: '/b.mp4', alt: 'B', title: '', source: 'comment', caption: 'B' },
  { kind: 'image', src: '/c.png', href: '/c.png', alt: 'C', title: '', source: 'comment' },
]

function counterText() {
  return document.querySelector('[data-testid="media-counter"]')?.textContent ?? ''
}

function mountViewer(props: Record<string, unknown> = {}) {
  return mount(MediaViewer, {
    attachTo: document.body,
    props: { items, open: true, startIndex: 0, ...props },
  })
}

describe('MediaViewer', () => {
  it('shows the start item and a 1-based counter', async () => {
    const w = mountViewer({ startIndex: 1 })
    await nextTick()
    expect(counterText()).toContain('2 / 3')
    expect(document.querySelector('video[src="/b.mp4"]')).toBeTruthy()
    w.unmount()
  })

  it('navigates with the next/prev buttons and clamps at the bounds', async () => {
    const w = mountViewer({ startIndex: 0 })
    await nextTick()
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Previous"]')!.disabled).toBe(true)
    document.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click()
    await nextTick()
    expect(counterText()).toContain('2 / 3')
    document.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click()
    document.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click()
    await nextTick()
    expect(counterText()).toContain('3 / 3')
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.disabled).toBe(true)
    w.unmount()
  })

  it('jumps to a thumbnail on click', async () => {
    const w = mountViewer()
    await nextTick()
    document.querySelector<HTMLButtonElement>('[aria-label="Media 3"]')!.click()
    await nextTick()
    expect(counterText()).toContain('3 / 3')
    w.unmount()
  })

  it('hides navigation and thumbnails for a single item', async () => {
    const w = mount(MediaViewer, {
      attachTo: document.body,
      props: { items: [items[0]], open: true, startIndex: 0 },
    })
    await nextTick()
    expect(document.querySelector('[aria-label="Next"]')).toBeNull()
    expect(document.querySelector('[aria-label="Media 1"]')).toBeNull()
    w.unmount()
  })

  it('marks the source of the current item', async () => {
    const w = mountViewer({ startIndex: 0 })
    await nextTick()
    expect(document.querySelector('[data-media-source="description"]')).toBeTruthy()
    document.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click()
    await nextTick()
    expect(document.querySelector('[data-media-source="comment"]')).toBeTruthy()
    w.unmount()
  })

  it('re-clamps the index when the collection shrinks while open', async () => {
    const w = mountViewer({ startIndex: 2 })
    await nextTick()
    expect(counterText()).toContain('3 / 3')
    await w.setProps({ items: [items[0]] })
    await nextTick()
    expect(counterText()).toContain('1 / 1')
    w.unmount()
  })

  it('closes when the backdrop is clicked, but not when the media itself is clicked', async () => {
    const w = mountViewer({ startIndex: 0 })
    await nextTick()
    // Clicking the media does not close the viewer.
    document.querySelector<HTMLElement>('img[src="/a.png"]')!.click()
    await nextTick()
    expect(w.emitted('update:open')).toBeFalsy()
    // Clicking the backdrop (the content root) closes it.
    document.querySelector<HTMLElement>('[data-testid="media-viewer"]')!.click()
    await nextTick()
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
    w.unmount()
  })
})
