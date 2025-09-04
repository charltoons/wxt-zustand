// Helpers to transform Zustand state for cross-context sync without losing actions

/**
 * Returns a shallow copy of the given state with any function-valued
 * properties removed. This ensures we only send serializable data across
 * messaging/storage layers.
 */
export function stripFunctionProps<S>(state: S): S {
  if (state === null || typeof state !== 'object') return state
  const src = state as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(src)) {
    const val = src[key]
    if (typeof val !== 'function') out[key] = val
  }
  return out as S
}

/**
 * Merge next state into a new object while preserving any function-valued
 * properties from the current state. Non-function keys are replaced exactly
 * by `next` to keep replace semantics for data.
 */
export function mergeStatePreservingFunctions<S>(current: S, next: S): S {
  const curr = current as unknown as Record<string, unknown>
  const nxt = next as unknown as Record<string, unknown>
  const merged: Record<string, unknown> = { ...nxt }
  for (const key of Object.keys(curr)) {
    const val = curr[key]
    if (typeof val === 'function') merged[key] = val
  }
  return merged as S
}
