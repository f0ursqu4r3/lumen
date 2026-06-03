import { extractMedia, type MediaItem } from '@/lib/markdown'

export interface ViewerItem extends MediaItem {
  source: 'description' | 'comment'
  caption?: string
}

/** Minimal shape we need from a GitLab note. */
export interface MediaNote {
  body?: string | null
}

// Embed tokens (optionally followed by GitLab's {width= height=} attr list).
const EMBED = /!\[[^\]]*\]\([^)]*\)(?:\{[^}]*\})?/g

/** A comment's prose, with code blocks and media embeds removed, as a viewer caption. */
export function commentCaption(body: string | null | undefined): string | undefined {
  if (!body) return undefined
  const text = body
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`[^`]*`/g, ' ') // inline code spans
    .replace(EMBED, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || undefined
}

/** Description media first, then each comment's media, in document order. */
export function buildIssueMedia(
  description: string | null | undefined,
  notes: MediaNote[],
  projectPath?: string,
): ViewerItem[] {
  const fromDesc = extractMedia(description, { projectPath }).map(
    (m): ViewerItem => ({ ...m, source: 'description', caption: m.title || m.alt || undefined }),
  )
  const fromNotes = notes.flatMap((n) =>
    extractMedia(n.body, { projectPath }).map(
      (m): ViewerItem => ({ ...m, source: 'comment', caption: commentCaption(n.body) }),
    ),
  )
  return [...fromDesc, ...fromNotes]
}
