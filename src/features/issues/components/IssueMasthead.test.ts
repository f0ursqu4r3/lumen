import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import IssueMasthead from './IssueMasthead.vue'

// Three modes share this fixture; each test sets embedded/windowed.
const baseProps = {
  issue: {
    iid: '7',
    title: 'X',
    author: { username: 'a' },
    createdAt: '2026-01-01',
    webUrl: '#',
  },
  repoName: 'proj',
  state: 'opened',
  linkCopied: null,
  fullPath: 'grp/proj',
}

const mountMasthead = (props: Record<string, unknown> = {}) =>
  mount(IssueMasthead, {
    props: { ...baseProps, ...props },
    // teleport: true renders the teleported cluster inline so we can assert on it.
    global: { stubs: { RouterLink: RouterLinkStub, teleport: true } },
  })

describe('IssueMasthead', () => {
  it('full-page: teleports the actions and drops the in-view back-link', () => {
    const w = mountMasthead({ embedded: false, windowed: false })
    // The shell top bar provides back + breadcrumb; the masthead drops its eyebrow.
    expect(w.find('[data-testid="back-to-issues"]').exists()).toBe(false)
    // Actions still rendered (teleport stubbed inline).
    expect(w.find('[data-testid="toggle-state"]').exists()).toBe(true)
    expect(w.find('[data-testid="copy-link"]').exists()).toBe(true)
    expect(w.find('[data-testid="open-in-gitlab"]').exists()).toBe(true)
    // The byline always renders in-body.
    expect(w.text()).toContain('Opened by')
  })

  it('full-page: emits copy/open-external/toggle-state from the teleported actions', async () => {
    const w = mountMasthead({ embedded: false, windowed: false })
    await w.get('[data-testid="copy-link"]').trigger('click')
    await w.get('[data-testid="open-in-gitlab"]').trigger('click')
    await w.get('[data-testid="toggle-state"]').trigger('click')
    expect(w.emitted('copy')).toBeTruthy()
    expect(w.emitted('open-external')).toBeTruthy()
    expect(w.emitted('toggle-state')).toBeTruthy()
  })

  it('windowed: keeps the inline header (no shell to teleport into)', () => {
    const w = mountMasthead({ embedded: false, windowed: true })
    expect(w.find('[data-testid="toggle-state"]').exists()).toBe(true)
    // Windowed shows the inert eyebrow, not a back-link.
    expect(w.find('[data-testid="back-to-issues"]').exists()).toBe(false)
    expect(w.text()).toContain('proj')
    expect(w.text()).toContain('Opened by')
  })

  it('embedded: keeps the inline header with an inert eyebrow (no back-link)', () => {
    const w = mountMasthead({ embedded: true, windowed: false })
    expect(w.find('[data-testid="toggle-state"]').exists()).toBe(true)
    expect(w.find('[data-testid="back-to-issues"]').exists()).toBe(false)
    expect(w.text()).toContain('proj')
  })

  it('shows Reopen when the state is closed', () => {
    const w = mountMasthead({ state: 'closed' })
    expect(w.get('[data-testid="toggle-state"]').text()).toContain('Reopen')
  })
})
