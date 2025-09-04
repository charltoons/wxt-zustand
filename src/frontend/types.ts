// Frontend script types for wxt-zustand
import type { BackendStoreService, WXTZustandAction } from '../types'

/**
 * Remote backend service exposed via @webext-core/proxy-service on the frontend.
 * We only rely on dispatch and fetchInitialState in the frontend path; the
 * other methods from BackendStoreService may be proxied to async versions which
 * we do not consume to avoid type friction.
 */
export type RemoteBackendService<S> = {
  dispatch(action: WXTZustandAction<S>): Promise<WXTZustandAction<S>>
  fetchInitialState(): Promise<S>
}

export type { BackendStoreService }
