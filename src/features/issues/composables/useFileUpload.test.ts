import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gitlabUpload } = vi.hoisted(() => ({ gitlabUpload: vi.fn() }))
vi.mock('@/shared/lib/rpc', () => ({ rpc: { gitlabUpload } }))

import { useFileUpload, uploadErrorMessage } from './useFileUpload'

beforeEach(() => gitlabUpload.mockReset())

function fileOf(name: string, type: string, body = 'data') {
  return new File([body], name, { type })
}

describe('useFileUpload', () => {
  it('uploads a file as base64 and returns the markdown verbatim', async () => {
    gitlabUpload.mockResolvedValue({
      ok: true,
      status: 201,
      markdown: '![a](/uploads/s/a.png)',
      url: '/uploads/s/a.png',
    })
    const { uploadFile } = useFileUpload('group/app')
    const result = await uploadFile(fileOf('a.png', 'image/png'))
    expect(result.markdown).toBe('![a](/uploads/s/a.png)')
    expect(result.url).toBe('/uploads/s/a.png')
    expect(result.isImage).toBe(true)
    const arg = gitlabUpload.mock.calls[0][0]
    expect(arg.fullPath).toBe('group/app')
    expect(arg.filename).toBe('a.png')
    expect(arg.contentType).toBe('image/png')
    expect(typeof arg.dataBase64).toBe('string')
    expect(arg.dataBase64.length).toBeGreaterThan(0)
  })

  it('flags non-image files as isImage:false', async () => {
    gitlabUpload.mockResolvedValue({
      ok: true,
      status: 201,
      markdown: '[a](/uploads/s/a.zip)',
      url: '/uploads/s/a.zip',
    })
    const { uploadFile } = useFileUpload('group/app')
    const result = await uploadFile(fileOf('a.zip', 'application/zip'))
    expect(result.isImage).toBe(false)
  })

  it('throws a mapped error when the upload fails', async () => {
    gitlabUpload.mockResolvedValue({ ok: false, status: 413 })
    const { uploadFile } = useFileUpload('group/app')
    await expect(uploadFile(fileOf('big.zip', 'application/zip'))).rejects.toThrow('File too large')
  })

  it('maps statuses to messages', () => {
    expect(uploadErrorMessage(413)).toBe('File too large')
    expect(uploadErrorMessage(401)).toBe('Not authorized to upload')
    expect(uploadErrorMessage(403)).toBe('Not authorized to upload')
    expect(uploadErrorMessage(500)).toBe('Upload failed (500)')
  })
})
