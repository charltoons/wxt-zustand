import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { StoreApi } from 'zustand'
import { createStore } from 'zustand/vanilla'

// Mock @webext-core/proxy-service before importing modules that depend on it
const serviceObj: any = {}
const mockDefineProxyService = mock((_name: string, _factory: any) => {
  return [mock(() => {}), mock(() => serviceObj)]
})

mock.module('@webext-core/proxy-service', () => ({
  defineProxyService: mockDefineProxyService,
}))

const { syncInitialStateFromBackground } = await import('./initial')

interface CounterState {
  count: number
}

describe('syncInitialStateFromBackground', () => {
  beforeEach(() => {
    mockDefineProxyService.mockClear()
    for (const k of Object.keys(serviceObj)) delete (serviceObj as any)[k]
  })

  test('applies initial state to local store', async () => {
    serviceObj.fetchInitialState = mock(
      async () => ({ count: 5 }) as CounterState,
    )
    const store: StoreApi<CounterState> = createStore<CounterState>(() => ({
      count: 0,
    }))

    await syncInitialStateFromBackground<CounterState>('counter', store)

    expect(store.getState().count).toBe(5)
    expect(serviceObj.fetchInitialState).toHaveBeenCalledTimes(1)
  })

  test('uses readiness cache to avoid duplicate fetch', async () => {
    serviceObj.fetchInitialState = mock(
      async () => ({ count: 10 }) as CounterState,
    )
    const store: StoreApi<CounterState> = createStore<CounterState>(() => ({
      count: 0,
    }))

    // First call performs the fetch and sets state
    await syncInitialStateFromBackground<CounterState>('counter', store)
    expect(store.getState().count).toBe(10)
    expect(serviceObj.fetchInitialState).toHaveBeenCalledTimes(1)

    // Mutate the service to prove we don't fetch again
    serviceObj.fetchInitialState = mock(
      async () => ({ count: 999 }) as CounterState,
    )
    await syncInitialStateFromBackground<CounterState>('counter', store)
    expect(store.getState().count).toBe(10)
    // Still only one call from the first initialization
    // (connectAndFetchInitialState called exactly once due to readiness cache)
    // Note: The second assigned mock is not invoked at all.
    expect(serviceObj.fetchInitialState.mock.calls.length).toBe(0)
  })
})
