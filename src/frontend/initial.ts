import type { StoreApi } from 'zustand'

import { connectAndFetchInitialState } from './connect'
import { getStoreReadiness, setStoreReadiness } from './ready'

/**
 * Fetch initial state from the background service and apply it to the local store.
 * - Uses readiness caching to avoid duplicate initialization work per store+name.
 * - Follows best practices for initial state loading in WXT extensions.
 * - Optimized to avoid double-fetch by using a connect+fetch helper.
 */
export async function syncInitialStateFromBackground<S>(
  storeName: string,
  store: StoreApi<S>,
): Promise<void> {
  // If an initialization is in-flight or done, await it.
  const existing = getStoreReadiness<S>(storeName, store)
  if (existing) {
    await existing
    return
  }

  const readiness = (async () => {
    const { initialState } = await connectAndFetchInitialState<S>(storeName)
    // Apply initial state to local store
    store.setState(initialState as S, true)
  })()

  setStoreReadiness(storeName, store, readiness)
  await readiness
}
