import { describe, it, expect } from 'vitest'
import { text, errorResult } from './types'

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
