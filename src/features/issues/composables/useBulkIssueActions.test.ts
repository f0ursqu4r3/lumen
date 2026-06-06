import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clearToasts, toasts } from '@/shared/composables/useToast'

const retagMutate = vi.fn()
const reassignMutate = vi.fn()
const setStatusMutate = vi.fn()
vi.mock('@/features/issues/composables/useIssueMutations', () => ({
  useRetagIssue: () => ({ mutateAsync: retagMutate }),
  useReassignIssue: () => ({ mutateAsync: reassignMutate }),
}))
vi.mock('@/features/issues/composables/useWorkItemStatus', () => ({
  useSetIssueStatus: () => ({ mutateAsync: setStatusMutate }),
}))
const confirmMock = vi.fn()
vi.mock('@/shared/composables/useConfirm', () => ({ useConfirm: () => ({ confirm: confirmMock }) }))

import { useBulkIssueActions } from './useBulkIssueActions'

beforeEach(() => {
  retagMutate.mockReset().mockResolvedValue(undefined)
  reassignMutate.mockReset().mockResolvedValue(undefined)
  setStatusMutate.mockReset().mockResolvedValue(undefined)
  confirmMock.mockReset()
  clearToasts()
})

describe('useBulkIssueActions', () => {
  it('does nothing when the confirm is declined', async () => {
    confirmMock.mockResolvedValue(false)
    const bulk = useBulkIssueActions('grp/proj')
    const r = await bulk.setStatus(['1', '2'], 's1', { id: 's1', name: 'Done' } as never)
    expect(r).toEqual({ succeeded: 0, failed: 0, cancelled: true })
    expect(setStatusMutate).not.toHaveBeenCalled()
  })

  it('applies status across all iids and toasts success', async () => {
    confirmMock.mockResolvedValue(true)
    const bulk = useBulkIssueActions('grp/proj')
    const status = { id: 's1', name: 'In progress' } as never
    const r = await bulk.setStatus(['1', '2', '3'], 's1', status)
    expect(setStatusMutate).toHaveBeenCalledTimes(3)
    expect(setStatusMutate).toHaveBeenCalledWith({ iid: '1', statusId: 's1', nextStatus: status })
    expect(r).toEqual({ succeeded: 3, failed: 0, cancelled: false })
    expect(toasts.value.at(-1)?.tone).toBe('success')
  })

  it('counts failures and toasts a failed tone', async () => {
    confirmMock.mockResolvedValue(true)
    reassignMutate.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined)
    const bulk = useBulkIssueActions('grp/proj')
    const r = await bulk.setAssignees(['1', '2'], ['alice'], [])
    expect(reassignMutate).toHaveBeenCalledTimes(2)
    expect(r).toEqual({ succeeded: 1, failed: 1, cancelled: false })
    expect(toasts.value.at(-1)?.tone).toBe('failed')
  })

  it('addLabels sends addLabelIds, removeLabels sends removeLabelIds', async () => {
    confirmMock.mockResolvedValue(true)
    const bulk = useBulkIssueActions('grp/proj')
    await bulk.addLabels(['1'], ['l1', 'l2'])
    expect(retagMutate).toHaveBeenCalledWith({
      iid: '1',
      addLabelIds: ['l1', 'l2'],
      removeLabelIds: [],
      nextLabels: [],
    })
    retagMutate.mockClear()
    await bulk.removeLabels(['1'], ['l3'])
    expect(retagMutate).toHaveBeenCalledWith({
      iid: '1',
      addLabelIds: [],
      removeLabelIds: ['l3'],
      nextLabels: [],
    })
  })
})
