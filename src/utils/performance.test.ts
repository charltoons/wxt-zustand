import { describe, expect, test } from 'bun:test'
import { shallowDiff, shallowPatch } from './'

describe('Performance tests', () => {
  test('should perform diff operations under 10ms for typical state sizes', () => {
    // Create a moderately complex state (typical for web extensions)
    const createState = (size: number) => {
      const state: Record<string, any> = {}
      for (let i = 0; i < size; i++) {
        state[`prop${i}`] = {
          id: i,
          name: `item${i}`,
          active: i % 2 === 0,
          data: [1, 2, 3, 4, 5],
        }
      }
      return state
    }

    const oldState = createState(100)
    const newState = {
      ...oldState,
      prop50: { ...oldState.prop50, name: 'updated' },
      prop99: null,
      newProp: 'added',
    }

    // Measure diff performance
    const startDiff = performance.now()
    const diff = shallowDiff(oldState, newState)
    const diffTime = performance.now() - startDiff

    // Measure patch performance
    const startPatch = performance.now()
    const result = shallowPatch(oldState, diff)
    const patchTime = performance.now() - startPatch

    console.log(`Diff time: ${diffTime.toFixed(3)}ms`)
    console.log(`Patch time: ${patchTime.toFixed(3)}ms`)
    console.log(`Total time: ${(diffTime + patchTime).toFixed(3)}ms`)

    // Verify correctness
    expect(result).toEqual(newState)

    // Performance assertions - should be well under 10ms
    expect(diffTime).toBeLessThan(5) // Diff should be very fast
    expect(patchTime).toBeLessThan(5) // Patch should be very fast
    expect(diffTime + patchTime).toBeLessThan(10) // Total should be under 10ms
  })

  test('should handle large state objects efficiently', () => {
    // Create a larger state (stress test)
    const createLargeState = (size: number) => {
      const state: Record<string, any> = {}
      for (let i = 0; i < size; i++) {
        state[`item${i}`] = {
          id: i,
          timestamp: Date.now(),
          metadata: { version: 1, type: 'test' },
          content: `This is item number ${i} with some content`,
        }
      }
      return state
    }

    const oldState = createLargeState(500)
    const newState = {
      ...oldState,
      item250: null, // Remove one
      item499: { ...oldState.item499, timestamp: Date.now() + 1000 }, // Update one
      newItem: { id: 500, content: 'new item' }, // Add one
    }

    const start = performance.now()
    const diff = shallowDiff(oldState, newState)
    const patchResult = shallowPatch(oldState, diff)
    const totalTime = performance.now() - start

    console.log(`Large state (500 items) total time: ${totalTime.toFixed(3)}ms`)
    console.log(`Changes detected: ${diff.length}`)

    // Verify correctness
    expect(patchResult).toEqual(newState)
    expect(diff.length).toBe(3) // Should detect 3 changes

    // Even with 500 items, should be fast
    expect(totalTime).toBeLessThan(10)
  })

  test('should optimize for no-change scenarios', () => {
    const state = {
      user: { name: 'John', id: 1 },
      settings: { theme: 'dark', lang: 'en' },
      data: [1, 2, 3, 4, 5],
    }

    // Test with identical states
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      const diff = shallowDiff(state, state)
      expect(diff).toEqual([])
    }
    const totalTime = performance.now() - start

    console.log(`1000 no-change diffs: ${totalTime.toFixed(3)}ms`)
    console.log(`Average per diff: ${(totalTime / 1000).toFixed(6)}ms`)

    // Should be very fast for no-change scenarios
    expect(totalTime).toBeLessThan(50) // 1000 operations in under 50ms
    expect(totalTime / 1000).toBeLessThan(0.1) // Each operation under 0.1ms
  })
})
