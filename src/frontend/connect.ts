import { createWXTZustandStoreService } from '../background/service'
import {
  isExtensionContextInvalidated,
  reloadPageOnInvalidation,
} from './errors'
import type { RemoteBackendService } from './types'

interface RetryOptions {
  retries?: number
  baseMs?: number
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Get a proxy-service client for a given store with retry/backoff.
 * - Uses only `fetchInitialState`/`dispatch` on the service per design.
 * - Background→frontend updates should be handled via `storage.watch` separately.
 */
export async function getBackendServiceWithRetry<S>(
  storeName: string,
  opts: RetryOptions = {},
): Promise<RemoteBackendService<S>> {
  const [, getService] = createWXTZustandStoreService<S>(storeName)
  const service = getService() as unknown as RemoteBackendService<S>

  // Probe connectivity by fetching initial state. If background
  // has not registered yet, proxy calls may fail; retry with backoff.
  const maxRetries = opts.retries ?? 5
  const baseMs = opts.baseMs ?? 50

  let attempt = 0
  // Try immediately once, then backoff on failures.
  // Only the probe is retried; the service instance is synchronous.
  while (true) {
    try {
      // Minimal probe to ensure background registered the service
      await service.fetchInitialState()
      return service
    } catch (err) {
      if (isExtensionContextInvalidated(err)) {
        reloadPageOnInvalidation()
        throw err
      }
      if (attempt >= maxRetries) {
        console.error(
          `Failed to connect to WXTZustandStore-${storeName} after ${attempt + 1} attempts.`,
          err,
        )
        throw err
      }
      const wait = baseMs * 2 ** attempt
      if (attempt === 0) {
        console.warn(
          `WXT Zustand: Service not ready for "${storeName}". Retrying up to ${maxRetries}x...`,
        )
      }
      await delay(wait)
      attempt++
    }
  }
}

/**
 * Lightweight helper that returns the raw service without probing.
 * Consumers should prefer `getBackendServiceWithRetry` in most cases.
 */
export function getBackendService<S>(
  storeName: string,
): RemoteBackendService<S> {
  const [, getService] = createWXTZustandStoreService<S>(storeName)
  return getService() as unknown as RemoteBackendService<S>
}

/**
 * Connects to the backend service and returns both the service and the
 * initial state with retry/backoff. This avoids a double fetch of
 * `fetchInitialState()` when the caller needs the initial state immediately.
 */
export async function connectAndFetchInitialState<S>(
  storeName: string,
  opts: RetryOptions = {},
): Promise<{ service: RemoteBackendService<S>; initialState: S }> {
  const [, getService] = createWXTZustandStoreService<S>(storeName)
  const service = getService() as unknown as RemoteBackendService<S>

  const maxRetries = opts.retries ?? 5
  const baseMs = opts.baseMs ?? 50

  let attempt = 0
  while (true) {
    try {
      const initialState = await service.fetchInitialState()
      return { service, initialState }
    } catch (err) {
      if (isExtensionContextInvalidated(err)) {
        reloadPageOnInvalidation()
        throw err
      }
      if (attempt >= maxRetries) {
        console.error(
          `Failed to fetch initial state for WXTZustandStore-${storeName} after ${attempt + 1} attempts.`,
          err,
        )
        throw err
      }
      const wait = baseMs * 2 ** attempt
      if (attempt === 0) {
        console.warn(
          `WXT Zustand: Initial state not ready for "${storeName}". Retrying up to ${maxRetries}x...`,
        )
      }
      await delay(wait)
      attempt++
    }
  }
}
