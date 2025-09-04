/**
 * Detects the classic Chromium error thrown when the extension context is lost.
 * Uses standard pattern matching for extension context invalidation detection.
 */
export function isExtensionContextInvalidated(err: unknown): boolean {
  if (!err) return false
  let msg: string
  if (err instanceof Error) {
    msg = err.message
  } else if (typeof err === 'object' && err !== null && 'message' in err) {
    msg = String((err as { message: unknown }).message)
  } else {
    msg = String(err)
  }
  return msg.includes('Extension context invalidated')
}

/**
 * Attempt to reload the page when the extension context is invalidated.
 * Guarded for environments where `window` is not defined (tests, SSR).
 */
export function reloadPageOnInvalidation(): void {
  try {
    if (typeof window !== 'undefined' && window?.location?.reload) {
      console.warn(
        'WXT Zustand: Reloading page as we lost connection to background script...',
      )
      window.location.reload()
    }
  } catch (_e) {
    // Ignore reload failures
  }
}

/**
 * Installs global listeners to detect extension context invalidation and reload.
 * - Listens to `unhandledrejection` and `error` events for the known error.
 * - Uses standard WXT extension handling: message check + reload.
 * - Returns a cleanup function to remove the listeners.
 */
export function installContextInvalidationReload(): () => void {
  if (typeof window === 'undefined' || !window.addEventListener) {
    return () => {}
  }

  let triggered = false

  const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
    if (triggered) return
    const reason = ev?.reason ?? ev
    if (isExtensionContextInvalidated(reason)) {
      triggered = true
      reloadPageOnInvalidation()
    }
  }

  const onError = (ev: ErrorEvent) => {
    if (triggered) return
    const candidate = ev?.error ?? ev?.message ?? ev
    if (isExtensionContextInvalidated(candidate)) {
      triggered = true
      reloadPageOnInvalidation()
    }
  }

  window.addEventListener('unhandledrejection', onUnhandledRejection)
  window.addEventListener('error', onError)

  return () => {
    try {
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
      window.removeEventListener('error', onError)
    } catch {
      // ignore
    }
  }
}
