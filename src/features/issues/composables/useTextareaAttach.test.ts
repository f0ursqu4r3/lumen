import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const { uploadFile } = vi.hoisted(() => ({ uploadFile: vi.fn() }))
vi.mock('./useFileUpload', () => ({
  useFileUpload: () => ({ uploadFile }),
  MAX_SOFT_BYTES: 10 * 1024 * 1024,
}))
const { pushToast } = vi.hoisted(() => ({ pushToast: vi.fn() }))
vi.mock('@/shared/composables/useToast', () => ({ pushToast }))

import { useTextareaAttach } from './useTextareaAttach'

function fileOf(name: string, type: string) {
  return new File(['x'], name, { type })
}

beforeEach(() => {
  uploadFile.mockReset()
  pushToast.mockReset()
})

describe('useTextareaAttach', () => {
  it('inserts a placeholder at the caret then swaps in the returned markdown', async () => {
    const text = ref('before after')
    const caret = ref(6) // between "before" and " after"
    uploadFile.mockResolvedValue({ markdown: '![a](/uploads/s/a.png)', url: '', isImage: true })
    const { handleFiles } = useTextareaAttach('g/a', text, () => caret.value)
    await handleFiles([fileOf('a.png', 'image/png')])
    expect(text.value).toContain('![a](/uploads/s/a.png)')
    expect(text.value).not.toContain('Uploading')
    expect(text.value.startsWith('before')).toBe(true)
  })

  it('removes the placeholder and toasts on failure', async () => {
    const text = ref('')
    uploadFile.mockRejectedValue(new Error('File too large'))
    const { handleFiles } = useTextareaAttach('g/a', text, () => 0)
    await handleFiles([fileOf('big.zip', 'application/zip')])
    expect(text.value).not.toContain('Uploading')
    expect(text.value).toBe('')
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'failed', title: 'Upload failed' }),
    )
  })

  it('uploads multiple files without placeholder collisions', async () => {
    const text = ref('')
    uploadFile
      .mockResolvedValueOnce({ markdown: '![a](/u/a.png)', url: '', isImage: true })
      .mockResolvedValueOnce({ markdown: '![b](/u/b.png)', url: '', isImage: true })
    const { handleFiles } = useTextareaAttach('g/a', text, () => text.value.length)
    await handleFiles([fileOf('a.png', 'image/png'), fileOf('b.png', 'image/png')])
    expect(text.value).toContain('![a](/u/a.png)')
    expect(text.value).toContain('![b](/u/b.png)')
    expect(text.value).not.toContain('Uploading')
  })

  it('appends the markdown when the placeholder was deleted mid-upload (no silent loss)', async () => {
    const text = ref('')
    let resolveUpload: (v: { markdown: string; url: string; isImage: boolean }) => void
    uploadFile.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve
      }),
    )
    const { handleFiles } = useTextareaAttach('g/a', text, () => 0)
    const pending = handleFiles([fileOf('a.png', 'image/png')])
    // Simulate the user clearing the editor (and the placeholder) before completion.
    text.value = 'rewritten body'
    resolveUpload!({ markdown: '![a](/u/a.png)', url: '', isImage: true })
    await pending
    expect(text.value).toContain('![a](/u/a.png)')
    expect(text.value).toContain('rewritten body')
    expect(text.value).not.toContain('Uploading')
  })
})
