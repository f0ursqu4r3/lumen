import { type Ref } from 'vue'
import { rpc } from '@/shared/lib/rpc'
import { useIssueSelection } from '@/features/issues/composables/useIssueSelection'
import { useBulkIssueActions } from '@/features/issues/composables/useBulkIssueActions'
import type { ProjectMember } from '@/features/projects/composables/useProjectMembers'
import type { WorkItemStatus } from '@/features/issues/composables/useWorkItemStatus'

// Owns multi-select state + the bulk-action handlers the BulkActionBar drives.
// The view still `provide()`s the returned `selection` (so rows/cards inject it)
// and passes `loadedIids` to selectAll.
export function useIssueBulkHandlers(
  fullPath: Ref<string>,
  members: Ref<ProjectMember[] | undefined>,
) {
  const selection = useIssueSelection(fullPath)
  const bulk = useBulkIssueActions(fullPath.value)

  function toggleSelectMode() {
    selection.setMode(!selection.mode.value)
  }

  function selectedIids() {
    return [...selection.selected.value]
  }
  function onAddLabels(labelIds: string[]) {
    bulk.addLabels(selectedIids(), labelIds)
  }
  function onRemoveLabels(labelIds: string[]) {
    bulk.removeLabels(selectedIids(), labelIds)
  }
  function onSetAssignee({ username }: { username: string | null }) {
    const member = members.value?.find((m) => m.username === username)
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
    bulk.setAssignees(selectedIids(), username ? [username] : [], nextAssignees)
  }
  function onSetStatus(status: WorkItemStatus) {
    bulk.setStatus(selectedIids(), status.id, status)
  }
  function onOpenCombined() {
    const iids = selectedIids()
    if (iids.length) rpc.openIssuesWindow({ fullPath: fullPath.value, iids })
  }

  return {
    selection,
    toggleSelectMode,
    onAddLabels,
    onRemoveLabels,
    onSetAssignee,
    onSetStatus,
    onOpenCombined,
  }
}
