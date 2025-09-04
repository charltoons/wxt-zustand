import type { StoreApi } from 'zustand'
import {
  createStorageKey as _createStorageKey,
  defineVersionedStoreItem as _defineVersionedStoreItem,
  loadStateFromStorage as _loadStateFromStorage,
  loadStateFromVersionedItem as _loadStateFromVersionedItem,
} from '../storage'
import type { StoreConfiguration } from '../types'
import { shallowDiff } from '../utils'
import { mergeStatePreservingFunctions } from '../utils/stateTransforms'
import { createWXTZustandStoreService as _createWXTZustandStoreService } from './service'

/**
 * Configuration options for initializing WXT Zustand store backend
 */
export interface WXTZustandStoreBackendProps<S> extends StoreConfiguration<S> {
  // Any additional backend-specific configuration can be added here
}

// Internal indirection for testing without global module mocks
let createStorageKey = _createStorageKey as typeof _createStorageKey
let loadStateFromStorage = _loadStateFromStorage as typeof _loadStateFromStorage
let createWXTZustandStoreService =
  _createWXTZustandStoreService as typeof _createWXTZustandStoreService
let defineVersionedStoreItem =
  _defineVersionedStoreItem as typeof _defineVersionedStoreItem
let loadStateFromVersionedItem =
  _loadStateFromVersionedItem as typeof _loadStateFromVersionedItem

export function __setInitImplementations(impl: {
  createStorageKey?: typeof _createStorageKey
  loadStateFromStorage?: typeof _loadStateFromStorage
  createWXTZustandStoreService?: typeof _createWXTZustandStoreService
  defineVersionedStoreItem?: typeof _defineVersionedStoreItem
  loadStateFromVersionedItem?: typeof _loadStateFromVersionedItem
}): void {
  if (impl.createStorageKey) createStorageKey = impl.createStorageKey
  if (impl.loadStateFromStorage)
    loadStateFromStorage = impl.loadStateFromStorage
  if (impl.createWXTZustandStoreService)
    createWXTZustandStoreService = impl.createWXTZustandStoreService
  if (impl.defineVersionedStoreItem)
    defineVersionedStoreItem = impl.defineVersionedStoreItem
  if (impl.loadStateFromVersionedItem)
    loadStateFromVersionedItem = impl.loadStateFromVersionedItem
}

export function __resetInitImplementations(): void {
  createStorageKey = _createStorageKey
  loadStateFromStorage = _loadStateFromStorage
  createWXTZustandStoreService = _createWXTZustandStoreService
  defineVersionedStoreItem = _defineVersionedStoreItem
  loadStateFromVersionedItem = _loadStateFromVersionedItem
}

/**
 * Initialize a WXT Zustand store backend for cross-context communication
 * This should be called in the background script to set up the store service
 *
 * @param storeName - Unique identifier for the store
 * @param store - The Zustand store instance to initialize
 * @param options - Configuration options for the store backend
 * @returns Promise resolving to the initialized store
 *
 * @example
 * ```typescript
 * // In background script
 * import { create } from 'zustand';
 * import { initWXTZustandStoreBackend } from 'wxt-zustand';
 *
 * const useStore = create((set) => ({
 *   count: 0,
 *   increment: () => set((state) => ({ count: state.count + 1 })),
 * }));
 *
 * await initWXTZustandStoreBackend('my-store', useStore, {
 *   storageStrategy: 'local'
 * });
 * ```
 */
export async function initWXTZustandStoreBackend<S>(
  storeName: string,
  store: StoreApi<S>,
  options: WXTZustandStoreBackendProps<S> = {} as WXTZustandStoreBackendProps<S>,
): Promise<StoreApi<S>> {
  // Phase 3.6 - Preload initial state from storage before registering service
  try {
    const area = options.storageStrategy || 'local'
    const current = store.getState()
    const preloaded =
      typeof options.storageVersion === 'number'
        ? await (async () => {
            const versionedOpts: {
              area?: typeof area
              version: number
              migrations?: Record<number, (prev: unknown) => S>
              fallback?: S
            } = {
              area,
              version: options.storageVersion as number,
              ...(options.storageMigrations && {
                migrations: options.storageMigrations,
              }),
              ...(options.storageFallback !== undefined && {
                fallback: options.storageFallback,
              }),
            }
            const item = defineVersionedStoreItem<S>(storeName, versionedOpts)
            return await loadStateFromVersionedItem<S>(item)
          })()
        : await (async () => {
            const deserializer: import('../types').DeserializerFn<S> =
              (options.deserializer as import('../types').DeserializerFn<S>) ||
              (JSON.parse as unknown as (v: string) => S)
            const storageKey = createStorageKey<S>(storeName, area)
            return await loadStateFromStorage<S>(storageKey, deserializer)
          })()
    if (preloaded !== undefined) {
      // Only replace if state actually differs to avoid unnecessary updates
      const diff = shallowDiff(
        current as unknown as Record<string, unknown>,
        preloaded as unknown as Record<string, unknown>,
      )
      if (diff.length > 0) {
        // Replace data while preserving any action functions on the store
        const merged = mergeStatePreservingFunctions<S>(current, preloaded)
        store.setState(merged, true)
      }
    }
  } catch (err) {
    console.error(
      `Error preloading state for WXT Zustand store "${storeName}":`,
      err,
    )
  }

  // Create the proxy service for this store
  const [registerService] = createWXTZustandStoreService<S>(storeName)

  // Register the service with the store and configuration (sets up persistence/broadcast subscription)
  try {
    registerService(store, options)
  } catch (err) {
    console.error(
      `Error registering background service for store "${storeName}":`,
      err,
    )
  }

  // Phase 3.7 - Error handling and connection management will be added later
  return store
}
