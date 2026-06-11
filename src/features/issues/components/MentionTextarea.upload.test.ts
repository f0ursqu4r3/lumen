import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const { handleFiles } = vi.hoisted(() => ({ handleFiles: vi.fn() }))
vi.mock('@/features/issues/composables/useTextareaAttach', () => ({
  useTextareaAttach: () => ({
    dragging: { value: false },
    fileInput: { value: null },
    handleFiles,
    onPaste: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    openPicker: vi.fn(),
    onPick: vi.fn(),
  }),
}))

import MentionTextarea from './MentionTextarea.vue'

beforeEach(() => handleFiles.mockReset())

describe('MentionTextarea uploads', () => {
  it('renders the attach footer only when fullPath is set', () => {
    const without = mount(MentionTextarea, { props: { members: [], modelValue: '' } })
    expect(without.find('[data-testid="attach-file"]').exists()).toBe(false)

    const withPath = mount(MentionTextarea, {
      props: { members: [], modelValue: '', fullPath: 'g/a' },
    })
    expect(withPath.find('[data-testid="attach-file"]').exists()).toBe(true)
  })

  it('renders a hidden file input when fullPath is set', () => {
    const wrapper = mount(MentionTextarea, {
      props: { members: [], modelValue: '', fullPath: 'g/a' },
    })
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
  })
})
