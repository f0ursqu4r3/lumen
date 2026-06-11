import { describe, it, expect } from 'vitest'
import { text, errorResult, iidParam } from './types'

describe('result helpers', () => {
  it('text() wraps a string as a single text content block', () => {
    expect(text('hello')).toEqual({ content: [{ type: 'text', text: 'hello' }] })
  })

  it('text() serializes a non-string value as pretty JSON', () => {
    expect(text({ a: 1 })).toEqual({ content: [{ type: 'text', text: '{\n  "a": 1\n}' }] })
  })

  it('errorResult() marks the result isError', () => {
    expect(errorResult('boom')).toEqual({
      content: [{ type: 'text', text: 'boom' }],
      isError: true,
    })
  })
})

describe('iidParam', () => {
  it('accepts a numeric string and passes it through', () => {
    expect(iidParam.parse('5')).toBe('5')
  })

  it('coerces a JSON number to its string form', () => {
    expect(iidParam.parse(42)).toBe('42')
  })

  it('rejects non-numeric values', () => {
    expect(() => iidParam.parse('abc')).toThrow(/iid must be numeric/)
    expect(() => iidParam.parse(5.5)).toThrow(/iid must be numeric/)
  })
})
