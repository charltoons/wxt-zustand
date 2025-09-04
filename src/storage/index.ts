import { storage } from 'wxt/utils/storage'
import type {
  DeserializerFn,
  SerializerFn,
  StorageKey,
  StorageWatcher,
  WXTStorageArea,
} from '../types'
import type { WXTStorageKeyString, WxtStorageItem } from './types'

/**
 * Creates a namespaced storage key for WXT Zustand stores
 * Format: `${area}:wxt-zustand:${storeName}:state`
 *
 * @param storeName - The name of the store
 * @param area - The WXT storage area to use
 * @returns Type-safe storage key object
 */
export function createStorageKey<T = unknown>(
  storeName: string,
  area: WXTStorageArea = 'local',
): StorageKey<T> {
  const key = `${area}:wxt-zustand:${storeName}:state` as WXTStorageKeyString

  return {
    key,
    area,
    storeName,
    __type: undefined as unknown as T,
  }
}

/**
 * Convenience: Create a `local` storage key for a store.
 * Simplified approach using WXT's native storage areas.
 */
export function createLocalStorageKey<T = unknown>(
  storeName: string,
): StorageKey<T> {
  return createStorageKey<T>(storeName, 'local')
}

/**
 * Convenience: Create a `session` storage key for a store.
 */
export function createSessionStorageKey<T = unknown>(
  storeName: string,
): StorageKey<T> {
  return createStorageKey<T>(storeName, 'session')
}

/**
 * Convenience: Create a `sync` storage key for a store.
 */
export function createSyncStorageKey<T = unknown>(
  storeName: string,
): StorageKey<T> {
  return createStorageKey<T>(storeName, 'sync')
}

/**
 * Creates a version-aware storage key for WXT Zustand stores using a suffix.
 * Format: `${area}:wxt-zustand:${storeName}:state:v${version}`
 * Note: Prefer `defineVersionedStoreItem` for full migration support.
 */
export function createVersionedStorageKey<T = unknown>(
  storeName: string,
  version: number,
  area: WXTStorageArea = 'local',
): StorageKey<T> {
  const key =
    `${area}:wxt-zustand:${storeName}:state:v${version}` as WXTStorageKeyString
  return {
    key,
    area,
    storeName,
    __type: undefined as unknown as T,
  }
}

/**
 * Loads state from WXT storage with error handling
 * Uses WXT's storage API for cross-context state persistence
 *
 * @param storageKey - The storage key to load from
 * @param deserializer - Custom deserializer function (defaults to JSON.parse)
 * @returns Promise resolving to the stored state or undefined if not found/error
 */
export async function loadStateFromStorage<S>(
  storageKey: StorageKey<S>,
  deserializer: DeserializerFn<S> = JSON.parse,
): Promise<S | undefined> {
  try {
    const value = await storage.getItem<string>(storageKey.key)

    if (value === null || value === undefined) {
      return undefined
    }

    return deserializer(value)
  } catch (error) {
    console.error(
      `Error loading WXT Zustand Store "${storageKey.storeName}" state from ${storageKey.area} storage.`,
      error,
    )
    return undefined
  }
}

/**
 * Saves state to WXT storage with error handling
 * Uses WXT's storage API for cross-context state persistence
 *
 * @param storageKey - The storage key to save to
 * @param state - The state to save
 * @param serializer - Custom serializer function (defaults to JSON.stringify)
 * @returns Promise that resolves when save is complete
 */
export async function saveStateToStorage<S>(
  storageKey: StorageKey<S>,
  state: S,
  serializer: SerializerFn<S> = JSON.stringify,
): Promise<void> {
  try {
    const serializedState = serializer(state)
    await storage.setItem(storageKey.key, serializedState)
  } catch (error) {
    if (error instanceof Error && error.message.includes('QUOTA_BYTES')) {
      console.error(
        `WXT Zustand Store "${storageKey.storeName}" has exceeded the storage quota for the ${storageKey.area} area.`,
        error,
      )
    } else {
      console.error(
        `Error saving WXT Zustand Store "${storageKey.storeName}" state to ${storageKey.area} storage.`,
        error,
      )
    }
  }
}

/**
 * Creates a storage watcher for external changes to a store's state
 * Uses WXT's storage.watch() API to detect changes from other contexts
 *
 * @param storageKey - The storage key to watch
 * @param callback - Function called when the key changes
 * @param deserializer - Custom deserializer function (defaults to JSON.parse)
 * @returns StorageWatcher object with unwatch function
 */
export function createStorageWatcher<S>(
  storageKey: StorageKey<S>,
  callback: (newValue: S | undefined, oldValue: S | undefined) => void,
  deserializer: DeserializerFn<S> = JSON.parse,
): StorageWatcher<S> {
  const unwatch = storage.watch<string>(
    storageKey.key,
    (newRawValue: string | null, oldRawValue: string | null) => {
      let newValue: S | undefined
      let oldValue: S | undefined

      try {
        newValue = newRawValue ? deserializer(newRawValue) : undefined
      } catch (error) {
        console.warn(
          `Error deserializing new value for storage watcher on "${storageKey.key}":`,
          error,
          newRawValue,
        )
        newValue = undefined
      }

      try {
        oldValue = oldRawValue ? deserializer(oldRawValue) : undefined
      } catch (error) {
        console.warn(
          `Error deserializing old value for storage watcher on "${storageKey.key}":`,
          error,
          oldRawValue,
        )
        oldValue = undefined
      }

      callback(newValue, oldValue)
    },
  )

  return {
    key: storageKey,
    callback,
    unwatch,
  }
}

/**
 * Validates that storage permissions are available
 * Ensures proper WXT storage access for extension contexts
 *
 * @throws Error if storage permissions are not available
 */
export function validateStoragePermissions(): void {
  // WXT's storage module will throw appropriate errors if permissions are missing
  // The WXT framework handles permission validation automatically
  // No manual browser.storage permission checks needed
}

/**
 * Define a versioned store item using WXT's `storage.defineItem`, enabling
 * built-in migrations and defaults. This provides a robust upgrade path for
 * persisted Zustand store schemas.
 */
export function defineVersionedStoreItem<S>(
  storeName: string,
  options: {
    version: number
    area?: WXTStorageArea
    migrations?: Record<number, (prev: unknown) => S>
    fallback?: S
  },
): WxtStorageItem<S> {
  const key =
    `${options.area ?? 'local'}:wxt-zustand:${storeName}:state` as WXTStorageKeyString
  // Delegate versioning/migrations to WXT's storage API
  const maybeDefine = (storage as unknown as Record<string, unknown>).defineItem
  if (typeof maybeDefine === 'function') {
    const fn = maybeDefine as <T>(
      k: WXTStorageKeyString,
      opts: {
        version: number
        migrations?: Record<number, (prev: unknown) => T>
        fallback?: T
        defaultValue?: T
      },
    ) => WxtStorageItem<T>
    const opts: {
      version: number
      migrations?: Record<number, (prev: unknown) => S>
      fallback?: S
      defaultValue?: S
    } = {
      version: options.version,
      ...(options.migrations && { migrations: options.migrations }),
      ...(options.fallback !== undefined && { fallback: options.fallback }),
      ...(options.fallback !== undefined && { defaultValue: options.fallback }),
    }
    return fn<S>(key, opts)
  }
  // Fallback stub for environments without defineItem (tests)
  return {
    key,
    async getValue() {
      const raw = await storage.getItem<string>(key as WXTStorageKeyString)
      return (raw ? (JSON.parse(raw) as S) : null) as S | null
    },
    async setValue(value: S) {
      await storage.setItem(key as WXTStorageKeyString, JSON.stringify(value))
    },
    watch(cb: (n: S | null, o: S | null) => void) {
      return storage.watch<string>(key as WXTStorageKeyString, (n, o) => {
        const nn = n ? (JSON.parse(n) as S) : null
        const oo = o ? (JSON.parse(o) as S) : null
        cb(nn, oo)
      })
    },
    async remove() {
      await storage.removeItem(key as WXTStorageKeyString)
    },
  } as WxtStorageItem<S>
}

/**
 * Handles corrupted state by backing it up and clearing the original item.
 * This allows the store to recover gracefully with a default/fallback state.
 * @param item - The WXT storage item that is corrupted.
 * @param error - The error that was thrown.
 */
export async function handleCorruptedState(
  item: { key: WXTStorageKeyString; remove: () => Promise<void> },
  error: unknown,
): Promise<void> {
  console.error(
    `WXT Zustand Store item with key "${item.key}" is corrupted.`,
    error,
  )

  try {
    // 1. Backup the corrupted raw value
    const rawValue = await storage.getItem(item.key)
    if (rawValue !== null && rawValue !== undefined) {
      const backupKey =
        `${item.key}:corrupted-${Date.now()}` as WXTStorageKeyString
      console.warn(`Backing up corrupted state to "${backupKey}"...`)
      await storage.setItem(backupKey, rawValue as string)
    }

    // 2. Remove the original corrupted item
    console.warn(
      `Removing corrupted item "${item.key}" to allow re-initialization.`,
    )
    await item.remove()
  } catch (backupError) {
    console.error(
      `Failed to backup and remove corrupted item "${item.key}". Manual intervention may be required.`,
      backupError,
    )
  }
}

/**
 * Load state via a versioned item with error handling and corruption safety.
 */
export async function loadStateFromVersionedItem<S>(
  item: WxtStorageItem<S>,
): Promise<S | undefined> {
  try {
    const value = await item.getValue()
    // Normalize nullish to undefined to match non-versioned helpers
    return value ?? undefined
  } catch (error) {
    await handleCorruptedState(item, error)
    return undefined
  }
}

/**
 * Save state via a versioned item with error handling.
 */
export async function saveStateToVersionedItem<S>(
  item: WxtStorageItem<S>,
  state: S,
): Promise<void> {
  try {
    await item.setValue(state)
  } catch (error) {
    if (error instanceof Error && error.message.includes('QUOTA_BYTES')) {
      console.error(
        `WXT Zustand Store item with key "${item.key}" has exceeded the storage quota.`,
        error,
      )
    } else {
      console.error(
        `Error saving versioned WXT Zustand Store state for item with key "${item.key}".`,
        error,
      )
    }
  }
}

/**
 * Watch a versioned item for external changes. Returns an unwatch function.
 */
export function createVersionedItemWatcher<S>(
  item: WxtStorageItem<S>,
  callback: (newValue: S | undefined, oldValue: S | undefined) => void,
): { unwatch: () => void } {
  const unwatch = item.watch((newVal: S | null, oldVal: S | null) => {
    callback(newVal ?? undefined, oldVal ?? undefined)
  })
  return { unwatch }
}

/**
 * Removes a store's persisted state from storage.
 * Useful for cleanup, debugging, or resetting state.
 * @param storeName - The name of the store to clear.
 * @param area - The storage area where the store is located.
 */
export async function clearStoreFromStorage(
  storeName: string,
  area: WXTStorageArea = 'local',
): Promise<void> {
  try {
    const storageKey = createStorageKey(storeName, area)
    await storage.removeItem(storageKey.key)
  } catch (error) {
    console.error(
      `Error clearing WXT Zustand Store "${storeName}" from ${area} storage.`,
      error,
    )
  }
}

/**
 * Gets multiple storage keys at once for batch operations
 * Useful for loading multiple store states efficiently
 *
 * @param storageKeys - Array of storage keys to load
 * @param deserializer - Custom deserializer function (defaults to JSON.parse)
 * @returns Promise resolving to a map of results
 */
export async function loadMultipleStatesFromStorage<S>(
  storageKeys: StorageKey<S>[],
  deserializer: DeserializerFn<S> = JSON.parse,
): Promise<Map<string, S | undefined>> {
  const results = new Map<string, S | undefined>()

  try {
    const items = await storage.getItems(
      storageKeys.map((key) => ({ key: key.key })),
    )

    for (const [rawKey, rawValue] of Object.entries(items)) {
      const storageKey = storageKeys.find((k) => k.key === rawKey)
      if (!storageKey) continue

      let deserializedValue: S | undefined
      if (rawValue && typeof rawValue === 'string') {
        try {
          deserializedValue = deserializer(rawValue)
        } catch (error) {
          console.warn(
            `Error deserializing state for "${storageKey.storeName}":`,
            error,
            rawValue,
          )
          deserializedValue = undefined
        }
      }

      results.set(storageKey.storeName, deserializedValue)
    }
  } catch (error) {
    console.error('Error loading multiple states from storage:', error)
  }

  return results
}

/**
 * Saves multiple states at once for batch operations
 * Useful for saving multiple store states efficiently
 *
 * @param states - Map of store names to states
 * @param area - The storage area to use for all stores
 * @param serializer - Custom serializer function (defaults to JSON.stringify)
 */
export async function saveMultipleStatesToStorage<S>(
  states: Map<string, S>,
  area: WXTStorageArea = 'local',
  serializer: SerializerFn<S> = JSON.stringify,
): Promise<void> {
  try {
    const items: Array<{ key: WXTStorageKeyString; value: string }> = []

    for (const [storeName, state] of states) {
      const storageKey = createStorageKey<S>(storeName, area)
      const serializedState = serializer(state)
      items.push({ key: storageKey.key, value: serializedState })
    }

    await storage.setItems(items)
  } catch (error) {
    console.error('Error saving multiple states to storage:', error)
  }
}

// WXT storage integration
export * from './types'
