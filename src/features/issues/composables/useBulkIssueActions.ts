import { useRetagIssue, useReassignIssue } from '@/features/issues/composables/useIssueMutations'
import {
  useSetIssueStatus,
  type WorkItemStatus,
} from '@/features/issues/composables/useWorkItemStatus'
import { useConfirm } from '@/shared/composables/useConfirm'
import { pushToast } from '@/shared/composables/useToast'

export interface BulkResult {
  succeeded: number
  failed: number
  cancelled: boolean
}

type AssigneeNode = { id: string; name: string; username: string; avatarUrl: string | null }

const CANCELLED: BulkResult = { succeeded: 0, failed: 0, cancelled: true }

// Apply a single-issue mutation across many iids. Each call is independent (the
// underlying mutations already patch the shared issues cache optimistically), so
// we fire them together and tally settled results.
async function runAcross(
  iids: string[],
  one: (iid: string) => Promise<unknown>,
): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(iids.map((iid) => one(iid)))
  const failed = results.filter((r) => r.status === 'rejected').length
  return { succeeded: results.length - failed, failed }
}

function summarize(noun: string, succeeded: number, failed: number) {
  pushToast({
    tone: failed ? 'failed' : 'success',
    title: failed ? `${succeeded} ${noun} · ${failed} failed` : `${succeeded} ${noun}`,
  })
}

export function useBulkIssueActions(fullPath: string) {
  const retag = useRetagIssue(fullPath)
  const reassign = useReassignIssue(fullPath)
  const setStatusMutation = useSetIssueStatus(fullPath)
  const { confirm } = useConfirm()

  async function gate(question: string): Promise<boolean> {
    return confirm({ title: question, confirmLabel: 'Apply', cancelLabel: 'Cancel' })
  }

  async function addLabels(iids: string[], labelIds: string[]): Promise<BulkResult> {
    if (!(await gate(`Add ${labelIds.length} label(s) to ${iids.length} issue(s)?`)))
      return CANCELLED
    const { succeeded, failed } = await runAcross(iids, (iid) =>
      retag.mutateAsync({ iid, addLabelIds: labelIds, removeLabelIds: [], nextLabels: [] }),
    )
    summarize('issues updated', succeeded, failed)
    return { succeeded, failed, cancelled: false }
  }

  async function removeLabels(iids: string[], labelIds: string[]): Promise<BulkResult> {
    if (!(await gate(`Remove ${labelIds.length} label(s) from ${iids.length} issue(s)?`)))
      return CANCELLED
    const { succeeded, failed } = await runAcross(iids, (iid) =>
      retag.mutateAsync({ iid, addLabelIds: [], removeLabelIds: labelIds, nextLabels: [] }),
    )
    summarize('issues updated', succeeded, failed)
    return { succeeded, failed, cancelled: false }
  }

  async function setAssignees(
    iids: string[],
    usernames: string[],
    nextAssignees: AssigneeNode[],
  ): Promise<BulkResult> {
    const label = usernames.length
      ? `Assign ${iids.length} issue(s)?`
      : `Unassign ${iids.length} issue(s)?`
    if (!(await gate(label))) return CANCELLED
    const { succeeded, failed } = await runAcross(iids, (iid) =>
      reassign.mutateAsync({ iid, assigneeUsernames: usernames, nextAssignees }),
    )
    summarize('issues updated', succeeded, failed)
    return { succeeded, failed, cancelled: false }
  }

  async function setStatus(
    iids: string[],
    statusId: string,
    nextStatus: WorkItemStatus,
  ): Promise<BulkResult> {
    if (!(await gate(`Set status to "${nextStatus.name}" for ${iids.length} issue(s)?`)))
      return CANCELLED
    const { succeeded, failed } = await runAcross(iids, (iid) =>
      setStatusMutation.mutateAsync({ iid, statusId, nextStatus }),
    )
    summarize('issues updated', succeeded, failed)
    return { succeeded, failed, cancelled: false }
  }

  return { addLabels, removeLabels, setAssignees, setStatus }
}
