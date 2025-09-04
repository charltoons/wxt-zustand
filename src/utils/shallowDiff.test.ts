import { describe, expect, test } from 'bun:test'
import { ChangeType } from '../types'
import { isValidState, shallowDiff, shallowPatch } from './'

describe('isValidState', () => {
  test('should return true for valid objects', () => {
    expect(isValidState({})).toBe(true)
    expect(isValidState({ a: 1 })).toBe(true)
    expect(isValidState([])).toBe(true)
  })

  test('should return false for invalid states', () => {
    expect(isValidState(null)).toBe(false)
    expect(isValidState(undefined)).toBe(false)
    expect(isValidState('string')).toBe(false)
    expect(isValidState(123)).toBe(false)
    expect(isValidState(true)).toBe(false)
  })
})

describe('shallowDiff', () => {
  test('should detect updated properties', () => {
    const oldState = { a: 1, b: 2 }
    const newState = { a: 1, b: 3 }

    const diff = shallowDiff(oldState as any, newState as any)

    expect(diff).toEqual([{ change: ChangeType.UPDATED, key: 'b', value: 3 }])
  })

  test('should detect new properties', () => {
    const oldState = { a: 1 }
    const newState = { a: 1, b: 2 }

    const diff = shallowDiff(oldState as any, newState as any)

    expect(diff).toEqual([{ change: ChangeType.UPDATED, key: 'b', value: 2 }])
  })

  test('should detect removed properties', () => {
    const oldState = { a: 1, b: 2 }
    const newState = { a: 1 }

    const diff = shallowDiff(oldState as any, newState as any)

    expect(diff).toEqual([{ change: ChangeType.REMOVED, key: 'b' }])
  })

  test('should handle mixed changes', () => {
    const oldState = { a: 1, b: 2, c: 3 }
    const newState = { a: 1, b: 4, d: 5 }

    const diff = shallowDiff(oldState as any, newState as any)

    expect(diff).toContainEqual({
      change: ChangeType.UPDATED,
      key: 'b',
      value: 4,
    })
    expect(diff).toContainEqual({
      change: ChangeType.UPDATED,
      key: 'd',
      value: 5,
    })
    expect(diff).toContainEqual({ change: ChangeType.REMOVED, key: 'c' })
    expect(diff).toHaveLength(3)
  })

  test('should return empty diff for identical objects', () => {
    const state = { a: 1, b: 2 }
    const diff = shallowDiff(state, state)

    expect(diff).toEqual([])
  })

  test('should handle falsy values correctly', () => {
    const oldState = { a: 1, b: true, c: 'hello' }
    const newState = { a: 0, b: false, c: '' }

    const diff = shallowDiff(oldState, newState)

    expect(diff).toContainEqual({
      change: ChangeType.UPDATED,
      key: 'a',
      value: 0,
    })
    expect(diff).toContainEqual({
      change: ChangeType.UPDATED,
      key: 'b',
      value: false,
    })
    expect(diff).toContainEqual({
      change: ChangeType.UPDATED,
      key: 'c',
      value: '',
    })
  })

  test('should handle null and undefined values', () => {
    const oldState = { a: 1, b: 2 }
    const newState = { a: null, b: undefined }

    const diff = shallowDiff(oldState as any, newState as any)

    expect(diff).toContainEqual({
      change: ChangeType.UPDATED,
      key: 'a',
      value: null,
    })
    expect(diff).toContainEqual({
      change: ChangeType.UPDATED,
      key: 'b',
      value: undefined,
    })
  })

  test('should handle NaN values', () => {
    const oldState = { a: 1 }
    const newState = { a: NaN }

    const diff = shallowDiff(oldState, newState)

    expect(diff).toContainEqual({
      change: ChangeType.UPDATED,
      key: 'a',
      value: NaN,
    })
  })

  test('should handle nested objects by reference', () => {
    const nestedObj = { x: 1 }
    const oldState = { a: nestedObj }
    const newState = { a: nestedObj } // Same reference

    const diff = shallowDiff(oldState, newState)

    expect(diff).toEqual([]) // No change because reference is the same
  })

  test('should detect nested object changes by reference', () => {
    const oldState = { a: { x: 1 } }
    const newState = { a: { x: 1 } } // Different reference, same content

    const diff = shallowDiff(oldState, newState)

    expect(diff).toContainEqual({
      change: ChangeType.UPDATED,
      key: 'a',
      value: { x: 1 },
    })
  })

  test('should throw error for invalid old state', () => {
    expect(() => shallowDiff(null as any, { a: 1 } as any)).toThrow(
      'shallowDiff can only diff valid state objects',
    )
    expect(() => shallowDiff('invalid' as any, { a: 1 } as any)).toThrow(
      'shallowDiff can only diff valid state objects',
    )
  })

  test('should throw error for invalid new state', () => {
    expect(() => shallowDiff({ a: 1 } as any, null as any)).toThrow(
      'shallowDiff can only diff valid state objects',
    )
    expect(() => shallowDiff({ a: 1 } as any, 'invalid' as any)).toThrow(
      'shallowDiff can only diff valid state objects',
    )
  })
})

describe('shallowPatch', () => {
  test('should apply updated properties', () => {
    const state = { a: 1, b: 2 }
    const diff = [{ change: ChangeType.UPDATED, key: 'b', value: 3 }]

    const result = shallowPatch(state as any, diff as any)

    expect(result).toEqual({ a: 1, b: 3 })
    expect(result).not.toBe(state) // Should return new object
  })

  test('should add new properties', () => {
    const state = { a: 1 }
    const diff = [{ change: ChangeType.UPDATED, key: 'b', value: 2 }]

    const result = shallowPatch(state as any, diff as any)

    expect(result).toEqual({ a: 1, b: 2 })
  })

  test('should remove properties', () => {
    const state = { a: 1, b: 2 }
    const diff = [{ change: ChangeType.REMOVED, key: 'b' }]

    const result = shallowPatch(state as any, diff as any)

    expect(result).toEqual({ a: 1 })
    expect('b' in result).toBe(false)
  })

  test('should handle mixed operations', () => {
    const state = { a: 1, b: 2, c: 3 }
    const diff = [
      { change: ChangeType.UPDATED, key: 'b', value: 4 },
      { change: ChangeType.UPDATED, key: 'd', value: 5 },
      { change: ChangeType.REMOVED, key: 'c' },
    ]

    const result = shallowPatch(state as any, diff as any)

    expect(result).toEqual({ a: 1, b: 4, d: 5 })
  })

  test('should apply falsy values correctly', () => {
    const state = { a: 1, b: true, c: 'hello' }
    const diff = [
      { change: ChangeType.UPDATED, key: 'a', value: 0 },
      { change: ChangeType.UPDATED, key: 'b', value: false },
      { change: ChangeType.UPDATED, key: 'c', value: '' },
    ]

    const result = shallowPatch(state as any, diff as any)

    expect(result).toEqual({ a: 0, b: false, c: '' })
  })

  test('should handle null and undefined values', () => {
    const state = { a: 1, b: 2 }
    const diff = [
      { change: ChangeType.UPDATED, key: 'a', value: null },
      { change: ChangeType.UPDATED, key: 'b', value: undefined },
    ]

    const result = shallowPatch(state as any, diff as any)

    expect(result).toEqual({ a: null, b: undefined })
  })

  test('should preserve original object immutability', () => {
    const state = { a: 1, b: 2 }
    const diff = [{ change: ChangeType.UPDATED, key: 'b', value: 3 }]

    const result = shallowPatch(state as any, diff as any)

    expect(state).toEqual({ a: 1, b: 2 }) // Original unchanged
    expect(result).toEqual({ a: 1, b: 3 })
  })

  test('should handle empty diff', () => {
    const state = { a: 1, b: 2 }
    const diff: any[] = []

    const result = shallowPatch(state as any, diff as any)

    expect(result).toEqual(state)
    expect(result).not.toBe(state) // Should still return new object
  })

  test('should warn for unknown change types', () => {
    const state = { a: 1 }
    const diff = [{ change: 'unknown' as any, key: 'a', value: 2 }]

    // Mock console.warn
    const originalWarn = console.warn
    const mockWarn = () => {} // Simple mock for bun:test
    console.warn = mockWarn

    const result = shallowPatch(state, diff)

    expect(result).toEqual({ a: 1 }) // Should remain unchanged for unknown change type

    // Restore console.warn
    console.warn = originalWarn
  })
})

describe('Round-trip tests (diff + patch)', () => {
  test('should maintain state integrity through diff and patch', () => {
    const oldState = { a: 1, b: 2, c: 3 }
    const newState = { a: 1, b: 4, d: 5 }

    const diff = shallowDiff(oldState as any, newState as any)
    const result = shallowPatch(oldState as any, diff as any)

    expect(result).toEqual(newState)
  })

  test('should handle complex state changes', () => {
    const oldState = {
      count: 0,
      user: { name: 'John' },
      items: [1, 2, 3],
      flag: true,
      optional: undefined,
    }
    const newState = {
      count: 5,
      user: { name: 'Jane' }, // Different reference
      items: [1, 2, 3], // Same content, different reference
      newProp: 'added',
      optional: null, // Changed from undefined to null
      // flag removed
    }

    const diff = shallowDiff(oldState as any, newState as any)
    const result = shallowPatch(oldState as any, diff as any)

    expect(result).toEqual(newState)
  })

  test('should handle empty object transitions', () => {
    const oldState = {}
    const newState = { a: 1, b: 2 }

    const diff = shallowDiff(oldState as any, newState as any)
    const result = shallowPatch(oldState as any, diff as any)

    expect(result).toEqual(newState)
  })

  test('should handle clearing all properties', () => {
    const oldState = { a: 1, b: 2, c: 3 }
    const newState = {}

    const diff = shallowDiff(oldState as any, newState as any)
    const result = shallowPatch(oldState as any, diff as any)

    expect(result).toEqual(newState)
  })
})
