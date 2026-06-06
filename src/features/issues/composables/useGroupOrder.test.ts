import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useGroupOrder } from './useGroupOrder'

beforeEach(() => localStorage.clear())

describe('useGroupOrder', () => {
  it('returns an empty order for an unknown dimension', () => {
    const { orderFor, hasOrder } = useGroupOrder(ref('grp/proj'))
    expect(orderFor('status')).toEqual([])
    expect(hasOrder('status')).toBe(false)
  })

  it('round-trips an order per dimension', () => {
    const { orderFor, setOrder, hasOrder } = useGroupOrder(ref('grp/proj'))
    setOrder('status', ['c', 'a', 'b'])
    expect(orderFor('status')).toEqual(['c', 'a', 'b'])
    expect(hasOrder('status')).toBe(true)
    expect(orderFor('assignee')).toEqual([])
  })

  it('reset clears one dimension without touching others', () => {
    const { orderFor, setOrder, reset } = useGroupOrder(ref('grp/proj'))
    setOrder('status', ['a'])
    setOrder('assignee', ['x'])
    reset('status')
    expect(orderFor('status')).toEqual([])
    expect(orderFor('assignee')).toEqual(['x'])
  })

  it('setOrder with an empty array clears the dimension', () => {
    const { orderFor, hasOrder, setOrder } = useGroupOrder(ref('grp/proj'))
    setOrder('status', ['a', 'b'])
    setOrder('status', [])
    expect(orderFor('status')).toEqual([])
    expect(hasOrder('status')).toBe(false)
  })

  it('isolates order by project path', () => {
    const fullPath = ref('grp/one')
    const a = useGroupOrder(fullPath)
    a.setOrder('status', ['a', 'b'])
    fullPath.value = 'grp/two'
    expect(a.orderFor('status')).toEqual([])
  })
})
