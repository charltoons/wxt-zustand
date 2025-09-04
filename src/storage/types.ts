// Storage-related TypeScript definitions for wxt-zustand
// This file contains types for WXT storage integration and strategies

/**
 * WXT Storage Area types mapping to WXT storage prefixes
 * Maps to WXT's storage API: 'local:', 'session:', 'sync:', 'managed:'
 * Provides type-safe access to different browser storage areas
 */
export type WXTStorageArea = 'local' | 'session' | 'sync' | 'managed'

/**
 * Concrete storage key string type accepted by WXT storage
 */
export type WXTStorageKeyString =
  | `local:${string}`
  | `session:${string}`
  | `sync:${string}`
  | `managed:${string}`

/**
 * Type-safe storage key generic for WXT Zustand stores
 * Combines storage area prefix with store-specific key patterns
 * Provides compile-time type safety for storage operations
 */
export type StorageKey<T = unknown> = {
  /**
   * The full WXT storage key including area prefix
   * Format: `${area}:wxt-zustand:${storeName}:${suffix}`
   */
  readonly key: WXTStorageKeyString

  /**
   * The storage area where this key is stored
   */
  readonly area: WXTStorageArea

  /**
   * The store name this key belongs to
   */
  readonly storeName: string

  /**
   * Type information for the stored value (compile-time only)
   */
  readonly __type: T
}

/**
 * Storage watcher interface for listening to WXT storage changes
 * Based on WXT's storage.watch() API but typed for Zustand stores
 * Provides unsubscribe functionality and type safety
 */
export interface StorageWatcher<T = unknown> {
  /**
   * The storage key being watched
   */
  readonly key: StorageKey<T>

  /**
   * Callback function invoked when the watched key changes
   * @param newValue - The new value (can be undefined if deleted)
   * @param oldValue - The previous value (can be undefined if was unset)
   */
  readonly callback: (newValue: T | undefined, oldValue: T | undefined) => void

  /**
   * Function to stop watching this key
   * Should be called to clean up watchers and prevent memory leaks
   */
  readonly unwatch: () => void
}

/**
 * Minimal interface for a WXT defined storage item returned by `storage.defineItem`.
 * Only includes members used by this library.
 */
export interface WxtStorageItem<S> {
  readonly key: WXTStorageKeyString
  getValue: () => Promise<S | null>
  setValue: (value: S) => Promise<void>
  watch: (cb: (newVal: S | null, oldVal: S | null) => void) => () => void
  remove: () => Promise<void>
}
