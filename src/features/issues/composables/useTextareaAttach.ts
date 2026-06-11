import { ref, type Ref } from 'vue'
import { useFileUpload, MAX_SOFT_BYTES } from './useFileUpload'
import { pushToast } from '@/shared/composables/useToast'

/**
 * DOM glue for attaching files to a textarea: paste/drop/picker handlers plus a
 * placeholder-then-swap insertion. `caret()` returns the current selection offset
 * in `text` (the host component tracks it). Each in-flight upload gets a unique
 * token so concurrent uploads never collide, and completion swaps by exact-string
 * replace — so the user typing elsewhere mid-upload cannot misplace the reference.
 */
export function useTextareaAttach(fullPath: string, text: Ref<string>, caret: () => number) {
  const { uploadFile } = useFileUpload(fullPath)
  const dragging = ref(false)
  const fileInput = ref<HTMLInputElement | null>(null)
  let seq = 0

  function tokenFor(name: string, id: number, isImage: boolean): string {
    const label = `Uploading ${name}… #u${id}`
    return `${isImage ? '!' : ''}[${label}]()`
  }

  async function uploadOne(file: File): Promise<void> {
    if (file.size > MAX_SOFT_BYTES) {
      // The RPC client caps a request at 30s; a base64 payload this large can
      // approach that ceiling on a slow link, surfacing as a generic failure.
      pushToast({ tone: 'info', title: `${file.name} is large; upload may be slow or rejected.` })
    }
    const id = (seq += 1)
    const token = tokenFor(file.name, id, file.type.startsWith('image/'))
    const at = caret()
    text.value = `${text.value.slice(0, at)}${token}\n${text.value.slice(at)}`
    try {
      const { markdown } = await uploadFile(file)
      // The upload succeeded, so the file lives in GitLab regardless of the editor
      // state. If the placeholder is still present, swap in place; if the user
      // deleted it mid-flight, append the reference rather than silently losing it.
      text.value = text.value.includes(token)
        ? text.value.replace(token, markdown)
        : `${text.value}${text.value.endsWith('\n') || text.value === '' ? '' : '\n'}${markdown}`
    } catch (error) {
      text.value = text.value.replace(`${token}\n`, '').replace(token, '')
      pushToast({
        tone: 'failed',
        title: 'Upload failed',
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  async function handleFiles(list: FileList | File[] | null | undefined): Promise<void> {
    const files = Array.from(list ?? [])
    if (!files.length) return
    // Concurrent uploadOnes each capture caret() at call time, so simultaneous
    // drops stack their placeholders at the same position. Order is intentionally
    // unspecified here; do not thread caret through in a way that breaks the
    // unique-token guarantee that keeps the swaps collision-free.
    await Promise.all(files.map(uploadOne))
  }

  function onPaste(event: ClipboardEvent): void {
    const files = event.clipboardData?.files
    if (files && files.length) {
      event.preventDefault()
      void handleFiles(files)
    }
  }

  function onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types?.includes('Files')) {
      event.preventDefault()
      dragging.value = true
    }
  }

  function onDragLeave(): void {
    dragging.value = false
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault()
    dragging.value = false
    void handleFiles(event.dataTransfer?.files)
  }

  function openPicker(): void {
    fileInput.value?.click()
  }

  function onPick(event: Event): void {
    const input = event.target as HTMLInputElement
    const files = input.files // read before resetting the input
    input.value = '' // reset so the same file can be re-selected
    void handleFiles(files)
  }

  return {
    dragging,
    fileInput,
    handleFiles,
    onPaste,
    onDragOver,
    onDragLeave,
    onDrop,
    openPicker,
    onPick,
  }
}
