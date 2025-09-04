import { describe, expect, mock, test } from 'bun:test'
import {
  installContextInvalidationReload,
  isExtensionContextInvalidated,
  reloadPageOnInvalidation,
} from './errors'

describe('frontend error helpers', () => {
  test('isExtensionContextInvalidated detects known message', () => {
    expect(
      isExtensionContextInvalidated(
        new Error('Extension context invalidated.'),
      ),
    ).toBe(true)
    expect(
      isExtensionContextInvalidated({
        message: 'Extension context invalidated',
      }),
    ).toBe(true)
    expect(isExtensionContextInvalidated(new Error('random error'))).toBe(false)
  })

  test('reloadPageOnInvalidation calls window.location.reload when available', () => {
    const original = (globalThis as any).window
    const reload = mock(() => {})
    ;(globalThis as any).window = { location: { reload } } as any
    reloadPageOnInvalidation()
    expect(reload).toHaveBeenCalledTimes(1)
    ;(globalThis as any).window = original
  })

  test('installContextInvalidationReload listens to unhandledrejection and error', () => {
    const original = (globalThis as any).window

    const reload = mock(() => {})
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {
      error: [],
      unhandledrejection: [],
    }
    const addEventListener = mock(
      (type: string, cb: (...args: unknown[]) => void) => {
        if (!listeners[type]) listeners[type] = []
        listeners[type].push(cb)
      },
    )
    const removeEventListener = mock(
      (type: string, cb: (...args: unknown[]) => void) => {
        const arr = listeners[type] || []
        const idx = arr.indexOf(cb)
        if (idx >= 0) arr.splice(idx, 1)
      },
    )

    ;(globalThis as any).window = {
      addEventListener,
      removeEventListener,
      location: { reload },
    } as any

    const cleanup = installContextInvalidationReload()

    // Simulate unhandled rejection with the known message
    ;(listeners.unhandledrejection ?? []).forEach((cb) => {
      cb({ reason: new Error('Extension context invalidated.') })
    })
    expect(reload).toHaveBeenCalledTimes(1)

    // Cleanup removes listeners
    cleanup()
    expect(removeEventListener).toHaveBeenCalled()

    // Further events should not trigger additional reloads (already triggered once)
    ;(listeners.error ?? []).forEach((cb) => {
      cb({ message: 'Extension context invalidated' })
    })
    expect(reload).toHaveBeenCalledTimes(1)

    ;(globalThis as any).window = original
  })
})
