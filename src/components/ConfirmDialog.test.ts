import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { confirmState, useConfirm } from '@/composables/useConfirm'

beforeEach(() => {
  confirmState.open = false
  confirmState.resolve = null
})

describe('ConfirmDialog', () => {
  it('renders the active confirm title and resolves true on the action', async () => {
    const w = mount(ConfirmDialog, { attachTo: document.body })
    const { confirm } = useConfirm()
    const p = confirm({ title: 'Discard changes?' })
    await nextTick()
    expect(document.body.textContent).toContain('Discard changes?')
    document.querySelector<HTMLElement>('[data-testid="confirm-accept"]')!.click()
    await expect(p).resolves.toBe(true)
    w.unmount()
  })
})
