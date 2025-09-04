import type { StoreApi } from 'zustand'
import type { StoreConfiguration } from '../types'
import { mergeStatePreservingFunctions } from '../utils/stateTransforms'
import { connectAndFetchInitialState as _connectAndFetchInitialState } from './connect'
import { setupBidirectionalSync as _setupBidirectionalSync } from './sync'

/**
 * WeakMap registry to track per-store readiness promises.
 * Uses WXT-optimized approach for extension context management.
 * Map key: Zustand StoreApi instance (WeakMap avoids memory leaks)
 * Map value: Record of storeName -> readiness Promise<void>
 */
const readinessRegistry: WeakMap<
  StoreApi<unknown>,
  Record<string, Promise<void>>
> = new WeakMap()

function getRecord<S>(store: StoreApi<S>): Record<string, Promise<void>> {
  const existing = readinessRegistry.get(store as StoreApi<unknown>)
  if (existing) return existing
  const created: Record<string, Promise<void>> = {}
  readinessRegistry.set(store as StoreApi<unknown>, created)
  return created
}

/**
 * Returns the cached readiness promise for a given store and name, if any.
 */
export function getStoreReadiness<S>(
  storeName: string,
  store: StoreApi<S>,
): Promise<void> | undefined {
  const record = readinessRegistry.get(store as StoreApi<unknown>)
  return record?.[storeName]
}

/**
 * Caches a readiness promise for a given store and name.
 */
export function setStoreReadiness<S>(
  storeName: string,
  store: StoreApi<S>,
  readiness: Promise<void>,
): void {
  const record = getRecord(store)
  record[storeName] = readiness
}

/**
 * Cleanup cached readiness data.
 * - When storeName is provided, remove only that entry.
 * - Otherwise, remove the entire record for the StoreApi.
 */
export function cleanupStoreReadiness<S>(
  store: StoreApi<S>,
  storeName?: string,
): void {
  if (storeName) {
    const record = readinessRegistry.get(store as StoreApi<unknown>)
    if (!record) return
    delete record[storeName]
    // If record becomes empty, drop the WeakMap entry
    if (Object.keys(record).length === 0) {
      readinessRegistry.delete(store as StoreApi<unknown>)
    }
  } else {
    readinessRegistry.delete(store as StoreApi<unknown>)
  }
}

/**
 * For diagnostics/tests only: expose internal state length.
 */
export function __readinessSizeFor<S>(store: StoreApi<S>): number {
  const record = readinessRegistry.get(store as StoreApi<unknown>)
  return record ? Object.keys(record).length : 0
}

// Internal indirection for testability (avoid global mock.module collisions)
let connectAndFetchInitialState =
  _connectAndFetchInitialState as typeof _connectAndFetchInitialState
let setupBidirectionalSync =
  _setupBidirectionalSync as typeof _setupBidirectionalSync

export function __setReadyImplementations(impl: {
  connectAndFetchInitialState?: typeof _connectAndFetchInitialState
  setupBidirectionalSync?: typeof _setupBidirectionalSync
}): void {
  if (impl.connectAndFetchInitialState)
    connectAndFetchInitialState = impl.connectAndFetchInitialState
  if (impl.setupBidirectionalSync)
    setupBidirectionalSync = impl.setupBidirectionalSync
}

export function __resetReadyImplementations(): void {
  connectAndFetchInitialState = _connectAndFetchInitialState
  setupBidirectionalSync = _setupBidirectionalSync
}

/**
 * Orchestrate frontend readiness for a WXT Zustand store.
 * - Uses WXT-native primitives for optimal performance and compatibility.
 * - Ensures single initialization per (store instance + name) via readiness cache.
 * - Applies initial state, then sets up bidirectional sync.
 */
export async function wxtZustandStoreReady<S>(
  storeName: string,
  store: StoreApi<S>,
  config: StoreConfiguration<S> = {},
): Promise<StoreApi<S>> {
  // If we already kicked off readiness for this store+name, just await it.
  const existing = getStoreReadiness<S>(storeName, store)
  if (existing) {
    await existing
    return store
  }

  // Create a single readiness promise that both fetches initial state and
  // attaches sync. Cache it immediately to prevent duplicate work.
  const readiness = (async () => {
    const { initialState } = await connectAndFetchInitialState<S>(storeName)
    // Replace entire state but preserve any function props (e.g., actions)
    const merged = mergeStatePreservingFunctions<S>(
      store.getState(),
      initialState,
    )
    store.setState(merged, true)

    // After initial state is in place, wire up bidirectional sync.
    setupBidirectionalSync<S>(storeName, store, config)
  })()
  setStoreReadiness(storeName, store, readiness)
  await readiness
  return store
}
