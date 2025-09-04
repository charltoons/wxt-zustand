// TypeScript definitions for wxt-zustand
// This file will contain all the core types and interfaces

/**
 * Action interface for WXT Zustand state synchronization
 * Defines the structure for state synchronization messages between contexts
 */
export interface WXTZustandAction<S> {
  type: '__WXT_ZUSTAND_SYNC__'
  state: S
}

/**
 * Change types for state diffing operations
 */
export enum ChangeType {
  UPDATED = 'updated',
  REMOVED = 'removed',
  KEYS_UPDATED = 'updated_keys',
  ARRAY_UPDATED = 'updated_array',
}

/**
 * Individual state change descriptor for tracking modifications
 */
export interface StateChange {
  change: ChangeType
  key: string
  value?: unknown
}

/**
 * Array of state changes representing the difference between two states
 */
export type StateDiff = StateChange[]

/**
 * Function type for computing differences between two states
 */
export type DiffStrategyFn<S> = (oldState: S, newState: S) => StateDiff

/**
 * Function type for applying state differences to reconstruct state
 */
export type PatchStrategyFn<S> = (state: S, diff: StateDiff) => S

/**
 * Serializer function type for converting values to strings for storage/transport
 */
export type SerializerFn<T = unknown> = (value: T) => string

/**
 * Deserializer function type for converting strings back to values
 */
export type DeserializerFn<T = unknown> = (value: string) => T

/**
 * Configuration interface for WXT Zustand store setup
 * Controls storage strategies, serialization, and state diffing behavior
 */
export interface StoreConfiguration<S = unknown> {
  /**
   * Storage strategy for persistence across browser sessions
   * - 'local': Browser's local storage (persistent across sessions)
   * - 'session': Browser's session storage (cleared when tab closes)
   * - 'sync': Browser's sync storage (synced across devices if enabled)
   */
  storageStrategy?: 'local' | 'session' | 'sync'

  /**
   * Custom serializer function for converting state/diffs to string for storage/transport
   * Handles StateDiff, state objects, and actions for cross-context communication
   * Defaults to JSON.stringify if not provided
   */
  serializer?: SerializerFn<StateDiff | S | WXTZustandAction<S>>

  /**
   * Custom deserializer function for converting stored string back to values
   * Handles StateDiff, state objects, and actions for cross-context communication
   * Defaults to JSON.parse if not provided
   */
  deserializer?: DeserializerFn<WXTZustandAction<S> | S>

  /**
   * Function for computing state differences for performance optimization
   * Defaults to shallow diff strategy for efficient state synchronization
   * Uses function-based approach for maximum flexibility
   */
  diffStrategy?: DiffStrategyFn<S>

  /**
   * Function for applying state diffs to reconstruct state
   * Used on frontend to apply changes received from background
   * Defaults to shallow patch strategy matching the default diffStrategy
   */
  patchStrategy?: PatchStrategyFn<S>

  /**
   * Optional version of the persisted storage schema for this store.
   * When provided, the storage layer uses WXT's `storage.defineItem` with
   * migrations for robust upgrades.
   */
  storageVersion?: number

  /**
   * Migration functions to transform older versions to the current schema.
   * Keys are the target version to migrate to.
   */
  storageMigrations?: Record<number, (prev: unknown) => S>

  /**
   * Default value to use when no state is present in storage (versioned mode).
   * Used by WXT's `storage.defineItem` as its fallback/default.
   */
  storageFallback?: S
}

/**
 * Backend Store Service interface for proxy service communication
 * Defines the contract for background script store services in WXT extensions
 */
export interface BackendStoreService<S = unknown> {
  /**
   * Dispatches an action to update the store state
   * Provides async support for cross-context state updates
   * @param action - The WXT Zustand action containing state updates
   * @returns Promise resolving to the dispatched action
   */
  dispatch(action: WXTZustandAction<S>): Promise<WXTZustandAction<S>>

  /**
   * Gets the current state of the store
   * Direct method for reading the current state tree
   * @returns The current state of the store
   */
  getState(): S

  /**
   * Subscribes to state changes in the store
   * Callback will be invoked whenever the state changes
   * @param callback - Function to call when state changes
   * @returns Unsubscribe function to remove the listener
   */
  subscribe(callback: () => void): () => void

  /**
   * Fetches the initial state for frontend store synchronization
   * Used when frontend stores connect to initialize their state
   * @returns Promise resolving to the current state for initial sync
   */
  fetchInitialState(): Promise<S>

  /**
   * Internal cleanup hook used by the proxy-service lifecycle
   * Not part of public API but exposed for tests and diagnostics
   * @internal
   */
  _cleanup?: () => void
}

export * from './background/types'
export * from './frontend/types'
export * from './messaging/types'
export * from './storage/types'
export * from './utils/index'
