import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import type { IssueDraft } from '@/features/issues/lib/issueEdit'
import { useRailFields } from './useRailFields'

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

describe('useRailFields', () => {
  it('hides empty value fields and lists them in the Add menu', () => {
    const draft = ref(makeDraft())
    const original = ref(makeDraft())
    const { visibleKeys, hiddenFields } = useRailFields(draft, original)
    expect([...visibleKeys.value]).toEqual(['status', 'labels', 'assignees'])
    expect(hiddenFields.value.map((f) => f.key)).toEqual([
      'milestone',
      'dueDate',
      'weight',
      'estimate',
      'confidential',
    ])
  })

  it('reveal() shows an empty field and drops it from the Add menu', () => {
    const draft = ref(makeDraft())
    const original = ref(makeDraft())
    const { visibleKeys, hiddenFields, reveal } = useRailFields(draft, original)
    reveal('dueDate')
    expect(visibleKeys.value.has('dueDate')).toBe(true)
    expect(hiddenFields.value.map((f) => f.key)).not.toContain('dueDate')
  })

  it('remove() clears the value, hides the field, then resetReveal() restores derivation', () => {
    const draft = ref(makeDraft({ weight: 5 }))
    const original = ref(makeDraft({ weight: 5 }))
    const { visibleKeys, remove, resetReveal } = useRailFields(draft, original)
    expect(visibleKeys.value.has('weight')).toBe(true)
    remove('weight')
    expect(draft.value.weight).toBeNull()
    expect(visibleKeys.value.has('weight')).toBe(false)
    // After save the buffer re-syncs (original cleared) and the session intent resets:
    original.value = makeDraft()
    resetReveal()
    expect(visibleKeys.value.has('weight')).toBe(false)
  })

  it('tolerates a null draft (renders only pinned)', () => {
    const draft = ref<IssueDraft | null>(null)
    const original = ref<IssueDraft | null>(null)
    const { visibleKeys, hiddenFields } = useRailFields(draft, original)
    expect([...visibleKeys.value]).toEqual(['status', 'labels', 'assignees'])
    expect(hiddenFields.value).toEqual([])
  })
})
