import { ref, onUnmounted, type Ref } from 'vue'
import type { IssueListItem } from '@/features/issues/composables/useIssues'
import { useRetagIssue, useReassignIssue } from '@/features/issues/composables/useIssueMutations'
import {
  useSetIssueStatus,
  type WorkItemStatus,
} from '@/features/issues/composables/useWorkItemStatus'
import {
  boardDropIndex,
  planBoardMove,
  type GroupKey,
  type IssueGroup,
  type SortKey,
} from '@/features/issues/lib/issueView'
import type { ProjectMember } from '@/features/projects/composables/useProjectMembers'

export function useIssueBoardDnd(opts: {
  fullPath: string
  boardScope: Ref<string>
  sortKey: Ref<SortKey>
  statusCatalog: Ref<WorkItemStatus[] | undefined>
  members: Ref<ProjectMember[] | undefined>
}) {
  const retag = useRetagIssue(opts.fullPath)
  const reassign = useReassignIssue(opts.fullPath)
  const setStatus = useSetIssueStatus(opts.fullPath)
  const dragging = ref<IssueListItem | null>(null)
  const draggingIid = ref<string | null>(null)
  const dragOverKey = ref<string | null>(null)
  // The iid that just landed in a new lane — it wears the settle animation briefly
  // so an optimistic move reads as the card arriving, not blinking into place.
  const justDropped = ref<string | null>(null)
  let dropTimer: ReturnType<typeof setTimeout> | undefined

  // A compact "in-hand" ghost that follows the cursor while dragging, in place of
  // the browser's default full-card snapshot. Built imperatively (it lives outside
  // Vue's tree, only long enough to be snapshotted) and styled with theme tokens so
  // it matches light/dark. Rendered off-screen so it never flashes in the page.
  function buildDragGhost(issue: IssueListItem): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = [
      'position:fixed',
      'top:-1000px',
      'left:-1000px',
      'display:flex',
      'align-items:center',
      'gap:0.5rem',
      'max-width:18rem',
      'padding:0.5rem 0.75rem',
      'border-radius:0.625rem',
      'background:var(--card)',
      'color:var(--foreground)',
      'border:1px solid color-mix(in oklab, var(--primary) 55%, transparent)',
      'box-shadow:0 12px 30px rgba(0,0,0,0.45), 0 0 0 1px color-mix(in oklab, var(--primary) 22%, transparent)',
      'font-size:0.75rem',
      'font-weight:500',
      'line-height:1.2',
      'white-space:nowrap',
      'overflow:hidden',
    ].join(';')
    const dot = document.createElement('span')
    dot.style.cssText =
      'flex:0 0 auto;width:0.5rem;height:0.5rem;border-radius:9999px;background:var(--primary)'
    const text = document.createElement('span')
    text.textContent = issue.title
    text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
    el.append(dot, text)
    return el
  }

  function onDragStart(issue: IssueListItem, e: DragEvent) {
    dragging.value = issue
    draggingIid.value = issue.iid
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(issue.iid))
      // Custom drag image: append off-screen, snapshot, then drop on the next tick
      // (the snapshot is taken synchronously, so the live node isn't needed after).
      const ghost = buildDragGhost(issue)
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, 14, 16)
      setTimeout(() => ghost.remove(), 0)
    }
  }
  function clearDrag() {
    dragging.value = null
    draggingIid.value = null
    dragOverKey.value = null
  }
  function onDrop(group: IssueGroup) {
    const issue = dragging.value
    clearDrag()
    if (!issue) return
    const move = planBoardMove(issue, opts.boardScope.value as GroupKey, group)
    if (!move) return
    // Mark the moved card so it settles into its new lane (cleared after the anim).
    justDropped.value = issue.iid
    clearTimeout(dropTimer)
    dropTimer = setTimeout(() => (justDropped.value = null), 450)
    if (move.kind === 'retag') {
      retag.mutate({ iid: issue.iid, ...move })
    } else if (move.kind === 'status') {
      // The column key is the status id; pull the full status for the optimistic patch.
      const nextStatus = opts.statusCatalog.value?.find((s) => s.id === group.key)
      if (nextStatus) setStatus.mutate({ iid: issue.iid, statusId: move.statusId, nextStatus })
    } else {
      // Reassign to the column's member (or clear for Unassigned). group.key is the
      // username; build the optimistic assignee node from the project members.
      const member = opts.members.value?.find((m) => m.username === group.key)
      const nextAssignees = member
        ? [
            {
              id: member.id,
              name: member.name,
              username: member.username,
              avatarUrl: member.avatarUrl ?? null,
            },
          ]
        : []
      reassign.mutate({ iid: issue.iid, assigneeUsernames: move.assigneeUsernames, nextAssignees })
    }
  }

  // A column is a live drop target only while it's hovered AND dropping there
  // would actually move the card — `planBoardMove` returns null for the card's own
  // column (and the un-clearable "No status" lane). We use this for both the lane
  // highlight and the ghost placeholder, so the source lane stays quiet and the
  // ghost marks exactly where a real move lands.
  function isDropTarget(group: IssueGroup): boolean {
    if (!dragging.value || dragOverKey.value !== group.key) return false
    return planBoardMove(dragging.value, opts.boardScope.value as GroupKey, group) != null
  }

  // Where the ghost sits in a target lane: the position the card will sort into
  // once dropped (see boardDropIndex), so the placeholder previews the real spot.
  function ghostIndex(group: IssueGroup): number {
    return dragging.value ? boardDropIndex(group.issues, dragging.value, opts.sortKey.value) : 0
  }

  onUnmounted(() => clearTimeout(dropTimer))

  return {
    dragging,
    draggingIid,
    dragOverKey,
    justDropped,
    onDragStart,
    clearDrag,
    onDrop,
    isDropTarget,
    ghostIndex,
  }
}
