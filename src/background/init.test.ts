import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock WXT storage to avoid requiring browser environment
const mockStorage = {
  getItem: mock(async () => null),
  setItem: mock(async () => {}),
  getItems: mock(async () => ({})),
  setItems: mock(async () => {}),
  watch: mock(() => () => {}),
}
mock.module('wxt/utils/storage', () => ({ storage: mockStorage }))
// Also mock proxy-service to avoid any side-effects of real module
mock.module('@webext-core/proxy-service', () => ({
  defineProxyService: mock((_name: string, _factory: any) => [
    mock(() => {}),
    mock(() => ({})),
  ]),
}))

import type { StoreApi } from 'zustand'
import { createStore } from 'zustand'

// Import module under test after mocking
const initModule = await import('./init')
const {
  initWXTZustandStoreBackend,
  __setInitImplementations,
  __resetInitImplementations,
} = initModule as any

interface TestState {
  a: number
  b?: string
}

describe('initWXTZustandStoreBackend', () => {
  beforeEach(() => {
    __resetInitImplementations()
  })

  test('preloads and replaces state when different', async () => {
    const setState = mock(() => {})
    const store = {
      getState: () => ({ a: 1 }) as TestState,
      setState,
      subscribe: mock(() => mock(() => {})),
    } as unknown as StoreApi<TestState>

    const mockCreateKey = mock((name: string, area: string) => ({
      key: `${area}:wxt-zustand:${name}:state`,
      area,
      storeName: name,
    }))
    const mockLoad = mock(async () => ({ a: 2 }) as TestState)
    const mockCreateService = mock((_name: string) => [
      mock(() => {}),
      mock(() => ({})),
    ])

    __setInitImplementations({
      createStorageKey: mockCreateKey as any,
      loadStateFromStorage: mockLoad as any,
      createWXTZustandStoreService: mockCreateService as any,
    })

    const result = await initWXTZustandStoreBackend('storeA', store, {
      storageStrategy: 'local',
    })
    expect(result).toBe(store)
    // Replace flag true in zustand v5 second arg (we can't assert this directly with Bun mock)
    // But we can assert setState called once with preloaded value
    expect(setState).toHaveBeenCalledWith({ a: 2 }, true)
  })

  test('does not replace state when identical', async () => {
    const setState = mock(() => {})
    const store = {
      getState: () => ({ a: 1 }) as TestState,
      setState,
      subscribe: mock(() => mock(() => {})),
    } as unknown as StoreApi<TestState>

    const mockCreateKey = mock((name: string, area: string) => ({
      key: `${area}:wxt-zustand:${name}:state`,
      area,
      storeName: name,
    }))
    const mockLoad = mock(async () => ({ a: 1 }) as TestState)
    const mockCreateService = mock((_name: string) => [
      mock(() => {}),
      mock(() => ({})),
    ])

    __setInitImplementations({
      createStorageKey: mockCreateKey as any,
      loadStateFromStorage: mockLoad as any,
      createWXTZustandStoreService: mockCreateService as any,
    })

    await initWXTZustandStoreBackend('storeA', store, {
      storageStrategy: 'local',
    })
    expect(setState.mock.calls.length).toBe(0)
  })

  test('handles preload errors gracefully', async () => {
    const setState = mock(() => {})
    const store = {
      getState: () => ({ a: 1 }) as TestState,
      setState,
      subscribe: mock(() => mock(() => {})),
    } as unknown as StoreApi<TestState>

    const mockCreateKey = mock((name: string, area: string) => ({
      key: `${area}:wxt-zustand:${name}:state`,
      area,
      storeName: name,
    }))
    const mockLoad = mock(async () => {
      throw new Error('load failed')
    })
    const mockCreateService = mock((_name: string) => [
      mock(() => {}),
      mock(() => ({})),
    ])

    const originalError = console.error
    const errCalls: any[] = []
    console.error = ((...args: any[]) => {
      errCalls.push(args)
    }) as any

    __setInitImplementations({
      createStorageKey: mockCreateKey as any,
      loadStateFromStorage: mockLoad as any,
      createWXTZustandStoreService: mockCreateService as any,
    })

    await initWXTZustandStoreBackend('storeA', store, {
      storageStrategy: 'local',
    })

    expect(errCalls.length).toBeGreaterThan(0)
    expect(errCalls[0][0]).toBe(
      'Error preloading state for WXT Zustand store "storeA":',
    )

    console.error = originalError
  })

  test('handles register service errors and still returns store', async () => {
    const store = createStore<TestState>(() => ({ a: 1 }))

    const mockCreateKey = mock((name: string, area: string) => ({
      key: `${area}:wxt-zustand:${name}:state`,
      area,
      storeName: name,
    }))
    const mockLoad = mock(async () => undefined)
    const register = mock(() => {
      throw new Error('register failed')
    })
    const mockCreateService = mock((_name: string) => [
      register,
      mock(() => ({})),
    ])

    const originalError = console.error
    const errCalls: any[] = []
    console.error = ((...args: any[]) => {
      errCalls.push(args)
    }) as any

    __setInitImplementations({
      createStorageKey: mockCreateKey as any,
      loadStateFromStorage: mockLoad as any,
      createWXTZustandStoreService: mockCreateService as any,
    })

    const result = await initWXTZustandStoreBackend('storeA', store, {
      storageStrategy: 'local',
    })
    expect(result).toBe(store)
    expect(errCalls.length).toBeGreaterThan(0)
    expect(errCalls[0][0]).toBe(
      'Error registering background service for store "storeA":',
    )

    console.error = originalError
  })
})
