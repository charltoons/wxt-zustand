import { defineProxyService } from '@webext-core/proxy-service'
import type { StoreApi } from 'zustand'
import {
  createStorageKey as _createStorageKey,
  defineVersionedStoreItem as _defineVersionedStoreItem,
  saveStateToStorage as _saveStateToStorage,
  saveStateToVersionedItem as _saveStateToVersionedItem,
} from '../storage'
import type { WxtStorageItem } from '../storage/types'
import type {
  BackendStoreService,
  StoreConfiguration,
  WXTZustandAction,
} from '../types'

// no-op

/**
 * Store registry for managing multiple named Zustand stores
 * Maps store names to their corresponding StoreApi instances
 */
const storeRegistry = new Map<string, StoreApi<unknown>>()

/**
 * Connected clients registry for broadcasting state changes
 * Maps store names to Set of client IDs (for tracking connections)
 */
const connectedClients = new Map<string, Set<string>>()

/**
 * Storage watchers registry for external change detection
 * Maps store names to their storage watchers
 */
const storageWatchers = new Map<string, { unwatch: () => void }>()

// Internal indirection for storage functions to allow isolated testing without module mocking
let createKeyFn = _createStorageKey as typeof _createStorageKey
let saveStateFn = _saveStateToStorage as typeof _saveStateToStorage
let defineVersionedItemFn =
  _defineVersionedStoreItem as typeof _defineVersionedStoreItem
let saveStateVersionedFn =
  _saveStateToVersionedItem as typeof _saveStateToVersionedItem

export function __setStorageImplementations(impl: {
  createStorageKey?: typeof _createStorageKey
  saveStateToStorage?: typeof _saveStateToStorage
  defineVersionedStoreItem?: typeof _defineVersionedStoreItem
  saveStateToVersionedItem?: typeof _saveStateToVersionedItem
}): void {
  if (impl.createStorageKey) createKeyFn = impl.createStorageKey
  if (impl.saveStateToStorage) saveStateFn = impl.saveStateToStorage
  if (impl.defineVersionedStoreItem)
    defineVersionedItemFn = impl.defineVersionedStoreItem
  if (impl.saveStateToVersionedItem)
    saveStateVersionedFn = impl.saveStateToVersionedItem
}

export function __resetStorageImplementations(): void {
  createKeyFn = _createStorageKey
  saveStateFn = _saveStateToStorage
  defineVersionedItemFn = _defineVersionedStoreItem
  saveStateVersionedFn = _saveStateToVersionedItem
}

/**
 * Sleep helper for retry backoff
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Save to storage with a small exponential backoff on failure.
 * Keeps implementation local to background broadcast path, avoiding broader complexity.
 */
async function saveWithBackoff<S>(
  key: ReturnType<typeof createKeyFn<S>>,
  state: S,
  serializer: (v: S) => string,
  opts?: { retries?: number; baseMs?: number },
): Promise<void> {
  const retries = opts?.retries ?? 3
  const baseMs = opts?.baseMs ?? 50

  let attempt = 0
  // First attempt without delay
  // Then retry with 2^n backoff up to max attempts
  // This offers resilience against transient storage contention/errors
  /* eslint-disable no-constant-condition */
  while (true) {
    try {
      await saveStateFn(key, state, serializer)
      return // success
    } catch (err) {
      if (attempt >= retries) {
        console.error(
          `Failed to persist state after ${attempt + 1} attempts for "${key.storeName}" (${key.area}).`,
          err,
        )
        throw err // surface final error for caller's catch
      }
      const wait = baseMs * 2 ** attempt
      if (attempt === 0) {
        console.warn(
          `Storage save failed for "${key.storeName}". Retrying up to ${retries}x with backoff...`,
        )
      }
      await delay(wait)
      attempt++
    }
  }
}

/**
 * Backoff wrapper for versioned items using defineItem's setValue.
 */
async function saveVersionedWithBackoff<S>(
  item: WxtStorageItem<S>,
  state: S,
  opts?: { retries?: number; baseMs?: number },
): Promise<void> {
  const retries = opts?.retries ?? 3
  const baseMs = opts?.baseMs ?? 50
  let attempt = 0
  while (true) {
    try {
      await saveStateVersionedFn(item, state)
      return
    } catch (err) {
      if (attempt >= retries) {
        console.error(
          `Failed to persist versioned state after ${attempt + 1} attempts.`,
          err,
        )
        throw err
      }
      const wait = baseMs * 2 ** attempt
      if (attempt === 0) {
        console.warn(
          `Versioned storage save failed. Retrying up to ${retries}x with backoff...`,
        )
      }
      await delay(wait)
      attempt++
    }
  }
}

/**
 * Register a Zustand store with a given name for proxy service access
 * @param name - Unique identifier for the store
 * @param store - The Zustand store instance to register
 */
export function registerStore<S>(name: string, store: StoreApi<S>): void {
  storeRegistry.set(name, store)

  // Initialize connected clients set for this store
  if (!connectedClients.has(name)) {
    connectedClients.set(name, new Set())
  }
}

/**
 * Retrieve a registered store by name
 * @param name - The name of the store to retrieve
 * @returns The store instance or undefined if not found
 */
export function getStore<S>(name: string): StoreApi<S> | undefined {
  return storeRegistry.get(name) as StoreApi<S> | undefined
}

/**
 * Remove a store from the registry
 * @param name - The name of the store to unregister
 */
export function unregisterStore(name: string): void {
  storeRegistry.delete(name)
  connectedClients.delete(name)

  // Clean up storage watcher
  const watcher = storageWatchers.get(name)
  if (watcher) {
    watcher.unwatch()
    storageWatchers.delete(name)
  }
}

/**
 * Track a connected client for a specific store
 * @param storeName - The name of the store
 * @param clientId - Unique identifier for the client
 */
export function trackClient(storeName: string, clientId: string): void {
  const clients = connectedClients.get(storeName)
  if (clients) {
    clients.add(clientId)
  }
}

/**
 * Remove a disconnected client
 * @param storeName - The name of the store
 * @param clientId - Unique identifier for the client
 */
export function untrackClient(storeName: string, clientId: string): void {
  const clients = connectedClients.get(storeName)
  if (clients) {
    clients.delete(clientId)
  }
}

/**
 * Persist and broadcast state changes via WXT storage
 * Writes the latest state to storage for persistence and notifies any
 * listeners (frontends watching the storage key) for synchronization.
 * @param storeName - The name of the store
 * @param state - The new state to persist/broadcast
 * @param config - Store configuration
 */
export async function broadcastStateChange<S>(
  storeName: string,
  state: S,
  config: StoreConfiguration<S> = {},
): Promise<void> {
  const clients = connectedClients.get(storeName)
  // Only broadcast if there are connected clients
  if (!clients || clients.size === 0) {
    return
  }
  try {
    const area = config.storageStrategy || 'local'
    if (typeof config.storageVersion === 'number') {
      const opts: {
        area?: typeof area
        version: number
        migrations?: Record<number, (prev: unknown) => S>
        fallback?: S
      } = {
        area,
        version: config.storageVersion as number,
        ...(config.storageMigrations && {
          migrations: config.storageMigrations as Record<
            number,
            (prev: unknown) => S
          >,
        }),
        ...(config.storageFallback !== undefined && {
          fallback: config.storageFallback as S,
        }),
      }
      const item = defineVersionedItemFn<S>(storeName, opts)
      await saveVersionedWithBackoff(item, state)
    } else {
      const storageKey = createKeyFn<S>(storeName, area)
      const serializer = config.serializer || JSON.stringify
      await saveWithBackoff(storageKey, state, serializer as (v: S) => string)
    }
  } catch (error) {
    console.error(
      `Error broadcasting state change for store "${storeName}":`,
      error,
    )
  }
}

/**
 * Generate a unique client ID for tracking connections
 */
function generateClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create proxy service definition for a WXT Zustand store
 * This creates the [registerService, getService] pair for communication between contexts
 * @param storeName - Unique name for the store
 * @returns Tuple of [registerService, getService] functions
 */
export function createWXTZustandStoreService<S>(storeName: string) {
  return defineProxyService<
    BackendStoreService<S>,
    [StoreApi<S>, StoreConfiguration<S>?]
  >(
    `WXTZustandStore-${storeName}`,
    (
      store: StoreApi<S>,
      config: StoreConfiguration<S> = {},
    ): BackendStoreService<S> => {
      // Register the store in our registry
      registerStore(storeName, store)

      // Generate a unique client ID for this service instance
      const clientId = generateClientId()
      trackClient(storeName, clientId)

      // Set up storage persistence and broadcasting
      let currentState = store.getState()

      // Subscribe to store changes to broadcast and persist state
      const unsubscribe = store.subscribe(async () => {
        const newState = store.getState()

        // Only broadcast if state actually changed
        if (newState !== currentState) {
          currentState = newState

          // Broadcast to other connected clients
          await broadcastStateChange(storeName, newState, config)
        }
      })

      // Clean up on service cleanup (proxy-service handles this automatically)
      const originalCleanup = () => {
        unsubscribe()
        untrackClient(storeName, clientId)
      }

      return {
        /**
         * Dispatch action to update store state
         * Validates action type and applies state changes
         */
        async dispatch(
          action: WXTZustandAction<S>,
        ): Promise<WXTZustandAction<S>> {
          if (action.type !== '__WXT_ZUSTAND_SYNC__') {
            console.warn('Unexpected action type:', action.type)
            return action
          }

          // Apply the state change to the store
          // The store.subscribe callback will handle broadcasting
          try {
            // Replace data while preserving any action functions on the store
            const curr = store.getState()
            const { mergeStatePreservingFunctions } = await import(
              '../utils/stateTransforms'
            )
            const merged = mergeStatePreservingFunctions<S>(curr, action.state)
            store.setState(merged, true)
          } catch (err) {
            console.error(
              `Error applying dispatched state for store "${storeName}":`,
              err,
            )
          }

          return action
        },

        /**
         * Get current state of the store
         */
        getState(): S {
          return store.getState()
        },

        /**
         * Subscribe to store changes
         */
        subscribe(callback: () => void): () => void {
          return store.subscribe(callback)
        },

        /**
         * Fetch initial state for frontend synchronization
         */
        async fetchInitialState(): Promise<S> {
          // Track this client as connected when they fetch initial state
          trackClient(storeName, clientId)
          return store.getState()
        },

        /**
         * Clean up client tracking when connection is lost
         * @internal
         */
        _cleanup: originalCleanup,
      }
    },
  )
}
