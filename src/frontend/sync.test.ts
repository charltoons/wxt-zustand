import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { StoreApi } from 'zustand'
import { createStore } from 'zustand/vanilla'

// Mock @webext-core/proxy-service before importing modules that depend on it
const serviceObj: any = { dispatch: mock(async () => ({})) }
const mockDefineProxyService = mock((_name: string, _factory: any) => {
  return [mock(() => {}), mock(() => serviceObj)]
})

// Storage.watch mock to capture unwatch calls
const unwatchMock = mock(() => {})
const watchMock = mock((_key: string, _cb: any) => {
  return unwatchMock
})

mock.module('wxt/utils/storage', () => ({
  storage: {
    watch: watchMock,
    // Other methods unused in this test
    getItem: mock(async () => undefined),
    setItem: mock(async () => {}),
    getItems: mock(async () => ({})),
    setItems: mock(async () => {}),
  },
}))

mock.module('@webext-core/proxy-service', () => ({
  defineProxyService: mockDefineProxyService,
}))

const { setupBidirectionalSync } = await import('./sync')

interface State {
  n: number
}

describe('setupBidirectionalSync cleanup', () => {
  beforeEach(() => {
    mockDefineProxyService.mockClear()
    serviceObj.dispatch.mockClear()
    unwatchMock.mockClear()
    watchMock.mockClear()
  })

  test('cleanup unsubscribes local and unwatch remote, idempotent', () => {
    const base: StoreApi<State> = createStore<State>(() => ({ n: 0 }))

    // Wrap subscribe to count unsubscribe calls
    const realSubscribe = base.subscribe.bind(base)
    let unsubscribeCount = 0
    ;(base as any).subscribe = ((listener: any) => {
      const unsub = realSubscribe(listener)
      return () => {
        unsubscribeCount++
        unsub()
      }
    }) as any

    const { cleanup } = setupBidirectionalSync<State>('alpha', base)

    expect(typeof cleanup).toBe('function')
    expect(watchMock).toHaveBeenCalledTimes(1)
    expect(unwatchMock).toHaveBeenCalledTimes(0)
    expect(unsubscribeCount).toBe(0)

    cleanup()
    expect(unwatchMock).toHaveBeenCalledTimes(1)
    expect(unsubscribeCount).toBe(1)

    // Second cleanup does nothing (idempotent)
    cleanup()
    expect(unwatchMock).toHaveBeenCalledTimes(1)
    expect(unsubscribeCount).toBe(1)
  })
})

test('dispatch invalidation triggers reload', async () => {
  const base: StoreApi<State> = createStore<State>(() => ({ n: 0 }))

  // Simulate extension context invalidated on dispatch
  serviceObj.dispatch = mock(async () => {
    throw new Error('Extension context invalidated.')
  })

  // Spy reload
  const originalWin = (globalThis as any).window
  const reload = mock(() => {})
  ;(globalThis as any).window = { location: { reload } } as any

  const { cleanup } = setupBidirectionalSync<State>('beta', base)
  // trigger a change
  base.setState({ n: 1 })

  // allow promise microtask to run
  await new Promise((r) => setTimeout(r, 0))

  expect(reload).toHaveBeenCalledTimes(1)
  cleanup()
  ;(globalThis as any).window = originalWin
})
