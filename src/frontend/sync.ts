import type { StoreApi } from 'zustand'
import {
  createStorageKey,
  createStorageWatcher,
  createVersionedItemWatcher,
  defineVersionedStoreItem,
} from '../storage'
import type { StoreConfiguration } from '../types'
import { shallowDiff } from '../utils'
import {
  mergeStatePreservingFunctions,
  stripFunctionProps,
} from '../utils/stateTransforms'
import { getBackendService } from './connect'
import {
  isExtensionContextInvalidated,
  reloadPageOnInvalidation,
} from './errors'
import type { RemoteBackendService } from './types'

/**
 * Set up bidirectional sync between a local Zustand store and the background.
 * - Local → Background: subscribe to local changes and dispatch full state.
 * - Background → Local: watch WXT storage and apply remote state.
 * - Loop prevention: temporarily unsubscribe local listener when applying remote state.
 *
 * Uses WXT-native storage.watch for background→local updates
 * instead of proxy service callbacks for optimal performance.
 */
export function setupBidirectionalSync<S>(
  storeName: string,
  store: StoreApi<S>,
  config: StoreConfiguration<S> = {},
): {
  service: RemoteBackendService<S>
  unsubscribeLocal: () => void
  unwatchRemote: () => void
  cleanup: () => void
} {
  // Resolve service without probing; caller should ensure readiness via initial sync.
  const service = getBackendService<S>(storeName)

  // Prepare storage key and (de)serializers.
  const area = config.storageStrategy || 'local'
  const usingVersioned = typeof config.storageVersion === 'number'
  const storageKey = usingVersioned
    ? undefined
    : createStorageKey<S>(storeName, area)
  const deserializer = (config.deserializer ||
    (JSON.parse as (v: string) => S)) as (v: string) => S

  // Local → Background
  const localCallback = (state: S /*, prev: S */) => {
    // Dispatch full state. Background handles broadcast via storage.
    // We intentionally don't await to keep UI responsive.
    const serializable = stripFunctionProps<S>(state)
    service
      .dispatch({ type: '__WXT_ZUSTAND_SYNC__', state: serializable })
      .catch((err) => {
        if (isExtensionContextInvalidated(err)) {
          reloadPageOnInvalidation()
          return
        }
        console.error('WXT Zustand: dispatch error', err)
      })
  }

  let unsubscribeLocal = store.subscribe(localCallback)

  // Background → Local via storage watcher or versioned item watcher
  const unwatchRemote = (() => {
    const onRemote = (newValue?: S) => {
      if (newValue === undefined) return
      const curr = store.getState()
      try {
        const diff = shallowDiff(
          curr as unknown as Record<string, unknown>,
          newValue as unknown as Record<string, unknown>,
        )
        if (!diff || diff.length === 0) return
      } catch {}
      unsubscribeLocal()
      try {
        const merged = mergeStatePreservingFunctions<S>(curr, newValue)
        store.setState(merged, true)
      } finally {
        unsubscribeLocal = store.subscribe(localCallback)
      }
    }

    if (usingVersioned) {
      const version = config.storageVersion as number
      const item = defineVersionedStoreItem<S>(storeName, {
        area,
        version,
        ...(config.storageMigrations && {
          migrations: config.storageMigrations as Record<
            number,
            (prev: unknown) => S
          >,
        }),
        ...(config.storageFallback !== undefined && {
          fallback: config.storageFallback as S,
        }),
      })
      return createVersionedItemWatcher<S>(item, (n) => onRemote(n)).unwatch
    }

    // String-key watcher fallback (non-versioned)
    const watcher = createStorageWatcher<S>(
      storageKey as NonNullable<typeof storageKey>,
      (n) => onRemote(n),
      deserializer,
    )
    return watcher.unwatch
  })()

  // Unified cleanup (idempotent) for component/page unmount.
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    try {
      unsubscribeLocal?.()
    } catch (err) {
      console.warn('WXT Zustand: error during local unsubscribe', err)
    }
    try {
      unwatchRemote?.()
    } catch (err) {
      console.warn('WXT Zustand: error during remote unwatch', err)
    }
  }

  return {
    service,
    unsubscribeLocal,
    unwatchRemote,
    cleanup,
  }
}
