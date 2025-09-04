// Core state diffing and patching utilities
// Optimized for efficient cross-context state synchronization

// Import then re-export to avoid TS/Bun re-export edge cases in tests
import { shallowDiff } from './shallowDiff'
import { shallowPatch } from './shallowPatch'

// Local export to avoid Bun TS re-export issue in tests
export function isValidState(state: unknown): state is Record<string, unknown> {
  return typeof state === 'object' && state !== null
}

export { shallowDiff, shallowPatch }

// Re-export types for convenience
export type {
  DiffStrategyFn,
  PatchStrategyFn,
  StateChange,
  StateDiff,
} from '../types'
export { ChangeType } from '../types'
