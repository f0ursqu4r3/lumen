import { marked } from 'marked'
import DOMPurify from 'dompurify'

// GitLab descriptions/notes are Markdown that may contain attacker-authored raw
// HTML. marked does not sanitize, and the dev-server proxy attaches the token to
// same-origin requests — so an unsanitized `<img onerror=fetch('/gitlab/...')>`
// could act as the user. Every rendered fragment goes through DOMPurify.
export function renderMarkdown(src: string | null | undefined): string {
  if (!src) return ''
  const html = marked.parse(src, { async: false }) as string
  return DOMPurify.sanitize(html)
}
