import { rpc } from '@/shared/lib/rpc'

/** Soft warning threshold; the real cap is server-configured. */
export const MAX_SOFT_BYTES = 10 * 1024 * 1024

export interface UploadedFile {
  markdown: string
  url: string
  isImage: boolean
}

export function uploadErrorMessage(status: number): string {
  if (status === 413) return 'File too large'
  if (status === 401 || status === 403) return 'Not authorized to upload'
  return `Upload failed (${status})`
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1)) // strip "data:<mime>;base64,"
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export function useFileUpload(fullPath: string) {
  async function uploadFile(file: File): Promise<UploadedFile> {
    const dataBase64 = await readAsBase64(file)
    const res = await rpc.gitlabUpload({
      fullPath,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      dataBase64,
    })
    if (!res.ok || !res.markdown) throw new Error(uploadErrorMessage(res.status))
    return { markdown: res.markdown, url: res.url ?? '', isImage: file.type.startsWith('image/') }
  }

  return { uploadFile }
}
