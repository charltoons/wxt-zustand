import { ChangeType, type StateDiff } from '../types'

/**
 * Applies a shallow patch to reconstruct state from a diff
 * Uses efficient diffing algorithm for optimal state synchronization performance
 *
 * @param obj - The base state object to apply patches to
 * @param difference - Array of changes to apply
 * @returns New state object with patches applied
 */
export function shallowPatch<S>(obj: S, difference: StateDiff): S {
  const newObj: { [key: string]: unknown } = Object.assign({}, obj)

  difference.forEach(({ change, key, value }) => {
    switch (change) {
      case ChangeType.UPDATED:
        newObj[key] = value as S
        break

      case ChangeType.REMOVED:
        Reflect.deleteProperty(newObj, key)
        break

      default:
        console.warn(
          `Unknown change type ${change} for key ${key} (value: ${value})`,
        )
    }
  })

  return newObj as S
}
