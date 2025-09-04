import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Ensure 'wxt/utils/storage' never loads a real browser polyfill in this test file
const mockStorage = {
  getItem: mock(async () => null),
  setItem: mock(async () => {}),
  getItems: mock(async () => ({})),
  setItems: mock(async () => {}),
  watch: mock(() => () => {}),
}
mock.module('wxt/utils/storage', () => ({ storage: mockStorage }))

import type { StoreApi } from 'zustand'
import { createStore } from 'zustand'
import type { StoreConfiguration, WXTZustandAction } from '../types'

// Note: Do not mock 'wxt/utils/storage' here to avoid cross-file interference.

// Storage function mocks (injected via service internals to avoid module-level mocking)
const mockSaveStateToStorage = mock(() => Promise.resolve())
const mockCreateStorageKey = mock((storeName: string, area = 'local') => ({
  key: `${area}:wxt-zustand:${storeName}:state`,
  area,
  storeName,
  __type: undefined,
}))

// Note: Do not mock '../utils' here; module mocks persist across files in Bun
// and would interfere with utils-specific tests. The service implementation
// does not rely on shallowDiff/shallowPatch, so no mock is necessary.

// Mock @webext-core/proxy-service
const mockDefineProxyService = mock((_name: string, factory: any) => {
  return [
    mock((store: any, config?: any) => factory(store, config)), // registerService
    mock(() => ({})), // getService
  ]
})

mock.module('@webext-core/proxy-service', () => ({
  defineProxyService: mockDefineProxyService,
}))

// Now import the service functions after all mocking is done
const serviceModule = await import('./service')
const {
  registerStore,
  getStore,
  unregisterStore,
  trackClient,
  untrackClient,
  broadcastStateChange,
  createWXTZustandStoreService,
  __setStorageImplementations,
  __resetStorageImplementations,
} = serviceModule as any

interface TestState {
  count: number
  name: string
}

describe('Store Registry', () => {
  beforeEach(() => {
    // Clear any existing stores
    const stores = ['test1', 'test2', 'test3']
    stores.forEach((name) => {
      try {
        unregisterStore(name)
      } catch {}
    })
  })

  test('should register and retrieve stores', () => {
    const store = createStore<TestState>(() => ({ count: 0, name: 'test' }))

    registerStore('testStore', store)

    const retrieved = getStore('testStore') as any as StoreApi<TestState>
    expect(retrieved).toBe(store)
  })

  test('should return undefined for non-existent store', () => {
    const retrieved = getStore('nonExistentStore')
    expect(retrieved).toBeUndefined()
  })

  test('should unregister stores and clean up', () => {
    const store = createStore<TestState>(() => ({ count: 0, name: 'test' }))

    registerStore('testStore', store)
    expect(getStore('testStore')).toBe(store)

    unregisterStore('testStore')
    expect(getStore('testStore')).toBeUndefined()
  })
})

describe('Client Tracking', () => {
  beforeEach(() => {
    unregisterStore('testStore')
  })

  test('should track and untrack clients', () => {
    const store = createStore<TestState>(() => ({ count: 0, name: 'test' }))
    registerStore('testStore', store)

    // Track clients
    trackClient('testStore', 'client1')
    trackClient('testStore', 'client2')
    trackClient('testStore', 'client1') // Duplicate should be handled by Set

    // Untrack client
    untrackClient('testStore', 'client1')

    // We can't directly test the internal Set, but we can test through broadcasting
    expect(() => {
      trackClient('testStore', 'client3')
      untrackClient('testStore', 'client3')
    }).not.toThrow()
  })

  test('should handle tracking clients for non-existent store', () => {
    // Should not throw error
    expect(() => {
      trackClient('nonExistentStore', 'client1')
      untrackClient('nonExistentStore', 'client1')
    }).not.toThrow()
  })
})

describe('State Broadcasting', () => {
  beforeEach(() => {
    mockSaveStateToStorage.mockClear()
    mockCreateStorageKey.mockClear()
    unregisterStore('testStore')
  })

  test('should broadcast state changes when clients are connected', async () => {
    __setStorageImplementations({
      createStorageKey: mockCreateStorageKey as any,
      saveStateToStorage: mockSaveStateToStorage as any,
    })
    const store = createStore<TestState>(() => ({ count: 0, name: 'test' }))
    registerStore('testStore', store)
    trackClient('testStore', 'client1')

    const newState = { count: 1, name: 'updated' }
    const config: StoreConfiguration<TestState> = { storageStrategy: 'session' }

    await broadcastStateChange('testStore', newState, config)

    expect(mockCreateStorageKey).toHaveBeenCalledWith('testStore', 'session')
    expect(mockSaveStateToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'session:wxt-zustand:testStore:state',
        area: 'session',
        storeName: 'testStore',
      }),
      newState,
      JSON.stringify,
    )
    __resetStorageImplementations()
  })

  test('should not broadcast when no clients are connected', async () => {
    __setStorageImplementations({
      createStorageKey: mockCreateStorageKey as any,
      saveStateToStorage: mockSaveStateToStorage as any,
    })
    const store = createStore<TestState>(() => ({ count: 0, name: 'test' }))
    registerStore('testStore', store)
    // No clients tracked

    const newState = { count: 1, name: 'updated' }
    await broadcastStateChange('testStore', newState)

    expect(mockSaveStateToStorage).not.toHaveBeenCalled()
    __resetStorageImplementations()
  })

  test('should use default storage strategy and serializer', async () => {
    __setStorageImplementations({
      createStorageKey: mockCreateStorageKey as any,
      saveStateToStorage: mockSaveStateToStorage as any,
    })
    const store = createStore<TestState>(() => ({ count: 0, name: 'test' }))
    registerStore('testStore', store)
    trackClient('testStore', 'client1')

    const newState = { count: 1, name: 'updated' }
    await broadcastStateChange('testStore', newState)

    expect(mockCreateStorageKey).toHaveBeenCalledWith('testStore', 'local')
    expect(mockSaveStateToStorage).toHaveBeenCalledWith(
      expect.any(Object),
      newState,
      JSON.stringify,
    )
    __resetStorageImplementations()
  })

  test('should handle broadcasting errors gracefully', async () => {
    __setStorageImplementations({
      createStorageKey: mockCreateStorageKey as any,
      saveStateToStorage: mockSaveStateToStorage as any,
    })
    const originalError = console.error
    const calls: any[] = []
    // Capture console.error reliably instead of Bun mock to avoid cross-file interference
    console.error = ((...args: any[]) => {
      calls.push(args)
    }) as any
    const broadcastError = new Error('Storage error')
    // Always reject so backoff exhausts and final error is logged
    mockSaveStateToStorage.mockRejectedValue(broadcastError)

    const store = createStore<TestState>(() => ({ count: 0, name: 'test' }))
    registerStore('testStore', store)
    trackClient('testStore', 'client1')

    const newState = { count: 1, name: 'updated' }
    await broadcastStateChange('testStore', newState)

    // Verify at least one error was logged, either from backoff exhaustion or broadcast catch
    expect(calls.length).toBeGreaterThan(0)
    const messages = calls.map((c) => String(c[0]))
    const hasBackoffError = messages.some((m) =>
      m.startsWith('Failed to persist state after'),
    )
    const hasBroadcastError = messages.some(
      (m) => m === 'Error broadcasting state change for store "testStore":',
    )
    expect(hasBackoffError || hasBroadcastError).toBe(true)
    console.error = originalError
    __resetStorageImplementations()
  })

  test('should retry saving state and succeed without error', async () => {
    __setStorageImplementations({
      createStorageKey: mockCreateStorageKey as any,
      saveStateToStorage: mockSaveStateToStorage as any,
    })
    const store = createStore<TestState>(() => ({ count: 0, name: 'test' }))
    registerStore('testStore', store)
    trackClient('testStore', 'client1')

    // First attempt fails, subsequent attempts succeed
    mockSaveStateToStorage.mockRejectedValueOnce(new Error('Transient error'))
    mockSaveStateToStorage.mockResolvedValueOnce(undefined)

    const originalError = console.error
    const errCalls: any[] = []
    console.error = ((...args: any[]) => {
      errCalls.push(args)
    }) as any

    const newState = { count: 2, name: 'ok' }
    await broadcastStateChange('testStore', newState)

    // Should be called at least twice due to retry
    expect(mockSaveStateToStorage.mock.calls.length).toBeGreaterThanOrEqual(2)
    // No final error should be logged since retry succeeded
    expect(errCalls.length).toBe(0)

    console.error = originalError
    __resetStorageImplementations()
  })

  test('should use custom serializer from config', async () => {
    __setStorageImplementations({
      createStorageKey: mockCreateStorageKey as any,
      saveStateToStorage: mockSaveStateToStorage as any,
    })
    const store = createStore<TestState>(() => ({ count: 0, name: 'test' }))
    registerStore('testStore', store)
    trackClient('testStore', 'client1')

    const customSerializer = mock(() => 'custom-serialized')
    const config: StoreConfiguration<TestState> = {
      serializer: customSerializer,
      storageStrategy: 'sync',
    }

    const newState = { count: 1, name: 'updated' }
    await broadcastStateChange('testStore', newState, config)

    expect(mockSaveStateToStorage).toHaveBeenCalledWith(
      expect.any(Object),
      newState,
      customSerializer,
    )
    __resetStorageImplementations()
  })
})

describe('WXT Zustand Store Service', () => {
  beforeEach(() => {
    mockDefineProxyService.mockClear()
    unregisterStore('testStore')
  })

  test('should create proxy service with correct name', () => {
    createWXTZustandStoreService('testStore')

    expect(mockDefineProxyService).toHaveBeenCalledWith(
      'WXTZustandStore-testStore',
      expect.any(Function),
    )
  })

  test('should return register and get service functions', () => {
    const result = createWXTZustandStoreService('testStore')

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    expect(typeof result[0]).toBe('function') // registerService
    expect(typeof result[1]).toBe('function') // getService
  })

  test('should create service with proper methods', () => {
    const store = createStore<TestState>(() => ({ count: 0, name: 'test' }))
    const config: StoreConfiguration<TestState> = { storageStrategy: 'local' }

    createWXTZustandStoreService('testStore')

    // Get the factory function that was passed to defineProxyService
    const [[, factory]] = mockDefineProxyService.mock.calls as any
    const service = factory(store, config)

    expect(service).toHaveProperty('dispatch')
    expect(service).toHaveProperty('getState')
    expect(service).toHaveProperty('subscribe')
    expect(service).toHaveProperty('fetchInitialState')
    expect(service).toHaveProperty('_cleanup')

    expect(typeof service.dispatch).toBe('function')
    expect(typeof service.getState).toBe('function')
    expect(typeof service.subscribe).toBe('function')
    expect(typeof service.fetchInitialState).toBe('function')
    expect(typeof service._cleanup).toBe('function')
  })

  test('should handle dispatch action correctly', async () => {
    // Use a plain mock StoreApi to avoid Bun mock limitations on Zustand store
    const setState = mock(() => {})
    const store = {
      getState: () => ({ count: 0, name: 'test' }),
      setState,
      subscribe: mock((_cb: () => void) => mock(() => {})),
    } as unknown as StoreApi<TestState>

    createWXTZustandStoreService('testStore')
    const [[, factory]] = mockDefineProxyService.mock.calls as any
    const service = factory(store, {})

    const action: WXTZustandAction<TestState> = {
      type: '__WXT_ZUSTAND_SYNC__',
      state: { count: 1, name: 'updated' },
    }

    const result = await service.dispatch(action)

    expect(setState).toHaveBeenCalledWith({ count: 1, name: 'updated' }, true)
    expect(result).toBe(action)
  })

  test('should not throw if setState throws in dispatch', async () => {
    const setState = mock(() => {
      throw new Error('update failed')
    })
    const store = {
      getState: () => ({ count: 0, name: 'test' }),
      setState,
      subscribe: mock((_cb: () => void) => mock(() => {})),
    } as unknown as StoreApi<TestState>

    const originalError = console.error
    const errorCalls: any[] = []
    console.error = ((...args: any[]) => {
      errorCalls.push(args)
    }) as any

    createWXTZustandStoreService('testStore')
    const [[, factory]] = mockDefineProxyService.mock.calls as any
    const service = factory(store, {})

    const action: WXTZustandAction<TestState> = {
      type: '__WXT_ZUSTAND_SYNC__',
      state: { count: 1, name: 'updated' },
    }

    const result = await service.dispatch(action)

    // Should return action and log error, not throw
    expect(result).toBe(action)
    expect(errorCalls.length).toBeGreaterThan(0)
    expect(errorCalls[0][0]).toBe(
      'Error applying dispatched state for store "testStore":',
    )

    console.error = originalError
  })

  test('should handle invalid action type', async () => {
    const originalWarn = console.warn
    const warnCalls: any[] = []
    console.warn = ((...args: any[]) => {
      warnCalls.push(args)
    }) as any
    const store = {
      getState: () => ({ count: 0, name: 'test' }),
      setState: mock(() => {}),
      subscribe: mock((_cb: () => void) => mock(() => {})),
    } as unknown as StoreApi<TestState>

    createWXTZustandStoreService('testStore')
    const [[, factory]] = mockDefineProxyService.mock.calls as any
    const service = factory(store, {})

    const invalidAction = {
      type: 'INVALID_TYPE',
      state: { count: 1, name: 'updated' },
    } as any

    const result = await service.dispatch(invalidAction)

    expect(warnCalls.length).toBeGreaterThan(0)
    expect(warnCalls[0][0]).toBe('Unexpected action type:')
    expect(warnCalls[0][1]).toBe('INVALID_TYPE')
    // setState should not be called
    expect((store as any).setState.mock.calls.length).toBe(0)
    expect(result).toBe(invalidAction)
    console.warn = originalWarn
  })

  test('should return current state', () => {
    const initialState = { count: 5, name: 'initial' }
    const store = createStore<TestState>(() => initialState)

    createWXTZustandStoreService('testStore')
    const [[, factory]] = mockDefineProxyService.mock.calls as any
    const service = factory(store, {})

    const state = service.getState()
    expect(state).toEqual(initialState)
  })

  test('should handle subscription', () => {
    const mockUnsubscribe = mock(() => {})
    const subscribeSpy = mock((_cb: () => void) => mockUnsubscribe)
    const store = {
      getState: () => ({ count: 0, name: 'test' }),
      setState: mock(() => {}),
      subscribe: subscribeSpy,
    } as unknown as StoreApi<TestState>

    createWXTZustandStoreService('testStore')
    const [[, factory]] = mockDefineProxyService.mock.calls as any
    const service = factory(store, {})

    const callback = mock(() => {})
    const unsubscribe = service.subscribe(callback)

    expect(subscribeSpy).toHaveBeenCalledWith(callback)
    expect(typeof unsubscribe).toBe('function')
  })

  test('should fetch initial state', async () => {
    const initialState = { count: 10, name: 'fetched' }
    const store = createStore<TestState>(() => initialState)

    createWXTZustandStoreService('testStore')
    const [[, factory]] = mockDefineProxyService.mock.calls as any
    const service = factory(store, {})

    const state = await service.fetchInitialState()
    expect(state).toEqual(initialState)
  })

  test('should register store on service creation', () => {
    const store = createStore<TestState>(() => ({ count: 0, name: 'test' }))

    createWXTZustandStoreService('testStore')
    const [[, factory]] = mockDefineProxyService.mock.calls as any
    factory(store, {})

    const registered = getStore('testStore') as any as StoreApi<TestState>
    expect(registered).toBe(store)
  })

  test('should setup automatic state broadcasting on store changes', () => {
    const unsubscribe = mock(() => {})
    const subscribeSpy = mock((callback: () => void) => {
      callback()
      return unsubscribe
    })
    const store = {
      getState: () => ({ count: 0, name: 'test' }),
      setState: mock(() => {}),
      subscribe: subscribeSpy,
    } as unknown as StoreApi<TestState>

    createWXTZustandStoreService('testStore')
    const [[, factory]] = mockDefineProxyService.mock.calls as any
    factory(store, { storageStrategy: 'session' })

    // The subscribe callback should have been called, which triggers broadcasting
    expect(subscribeSpy).toHaveBeenCalledWith(expect.any(Function))
  })
})

// Note: no restoration here to avoid re-importing modules under test across files
