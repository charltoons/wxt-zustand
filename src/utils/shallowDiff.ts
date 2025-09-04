import { ChangeType, type StateDiff } from '../types'

/**
 * Validates that a value is a valid state object that can be diffed
 * @param state - The value to validate
 * @returns True if the state is a valid object for diffing
 */
export function isValidState(state: unknown): state is Record<string, unknown> {
  return typeof state === 'object' && state !== null
}

/**
 * Computes a shallow diff between two state objects
 * Uses efficient diffing algorithm for optimal state synchronization performance
 *
 * @param oldObj - The previous state object
 * @param newObj - The new state object
 * @returns Array of changes representing the difference
 * @throws Error if either state is not a valid object
 */
export function shallowDiff<S>(oldObj: S, newObj: S): StateDiff {
  if (!isValidState(oldObj) || !isValidState(newObj)) {
    throw new Error('shallowDiff can only diff valid state objects')
  }

  const difference: StateDiff = []

  // Check for updated/new properties
  Object.keys(newObj).forEach((key) => {
    if (oldObj[key] !== newObj[key]) {
      difference.push({
        change: ChangeType.UPDATED,
        key,
        value: newObj[key] as S,
      })
    }
  })

  // Check for removed properties
  Object.keys(oldObj).forEach((key) => {
    if (!Object.hasOwn(newObj, key)) {
      difference.push({
        change: ChangeType.REMOVED,
        key,
      })
    }
  })

  return difference
}
