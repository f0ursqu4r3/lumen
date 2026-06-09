import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueDetailsRail from './IssueDetailsRail.vue'
import {
  hiddenFieldList,
  railField,
  type RailFieldDescriptor,
  type RailFieldKey,
} from '@/features/issues/lib/railFields'
import type { IssueDraft } from '@/features/issues/lib/issueEdit'

const issue = { milestone: null } as never

function makeDraft(over: Partial<IssueDraft> = {}): IssueDraft {
  return {
    title: 'T',
    description: '',
    state: 'opened',
    labelIds: [],
    assigneeUsernames: [],
    milestoneId: null,
    dueDate: '',
    weight: null,
    confidential: false,
    timeEstimate: '',
    statusId: null,
    ...over,
  }
}

function mountRail(opts: {
  visible: RailFieldKey[]
  hidden?: RailFieldDescriptor[]
  draft?: Partial<IssueDraft>
}) {
  const draft = makeDraft(opts.draft)
  return mount(IssueDetailsRail, {
    props: {
      issue,
      members: [],
      contributors: [],
      catalog: [],
      statusOptions: [],
      milestones: [],
      visibleKeys: new Set(opts.visible),
      hiddenFields: opts.hidden ?? [],
      // v-model props
      labelIds: draft.labelIds,
      statusId: draft.statusId,
      assigneeUsernames: draft.assigneeUsernames,
      milestoneId: draft.milestoneId,
      dueDate: draft.dueDate,
      weight: draft.weight,
      confidential: draft.confidential,
      timeEstimate: draft.timeEstimate,
    },
    global: {
      stubs: {
        StatusPicker: true,
        LabelPicker: true,
        AssigneeEditor: true,
        QuickAssign: true,
      },
    },
  })
}

describe('IssueDetailsRail progressive disclosure', () => {
  it('renders only visible non-pinned fields', () => {
    const w = mountRail({ visible: ['status', 'labels', 'assignees', 'dueDate'] })
    expect(w.find('[data-field="dueDate"]').exists()).toBe(true)
    expect(w.find('[data-field="weight"]').exists()).toBe(false)
    expect(w.find('[data-field="milestone"]').exists()).toBe(false)
  })

  it('lists hidden fields in the Add menu and emits add on selection', async () => {
    const hidden = hiddenFieldList(makeDraft(), makeDraft(), new Set(), new Set())
    const w = mountRail({ visible: ['status', 'labels', 'assignees'], hidden })
    await w.get('[data-testid="add-field-trigger"]').trigger('click')
    await w.get('[data-testid="add-field-weight"]').trigger('click')
    expect(w.emitted('add')?.at(-1)).toEqual(['weight'])
  })

  it('shows the confidential add label, not the field label, in the menu', async () => {
    const hidden = [railField('confidential')]
    const w = mountRail({ visible: ['status', 'labels', 'assignees'], hidden })
    await w.get('[data-testid="add-field-trigger"]').trigger('click')
    expect(w.get('[data-testid="add-field-confidential"]').text()).toBe('Mark confidential')
  })

  it('emits remove when a field × is clicked', async () => {
    const w = mountRail({
      visible: ['status', 'labels', 'assignees', 'weight'],
      draft: { weight: 3 },
    })
    await w.get('[data-field="weight"] [data-testid="rail-field-remove"]').trigger('click')
    expect(w.emitted('remove')?.at(-1)).toEqual(['weight'])
  })

  it('hides the Add menu when nothing is hidden', () => {
    const w = mountRail({
      visible: [
        'status',
        'labels',
        'assignees',
        'milestone',
        'dueDate',
        'weight',
        'estimate',
        'confidential',
      ],
      hidden: [],
    })
    expect(w.find('[data-testid="add-field-trigger"]').exists()).toBe(false)
  })
})
