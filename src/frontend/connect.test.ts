import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock @webext-core/proxy-service before importing modules that depend on it
const serviceObj: any = {}
const mockDefineProxyService = mock((_name: string, _factory: any) => {
  // We ignore the factory here because connect helpers only use getService()
  // which returns our mocked service object.
  return [
    mock(() => {}), // registerService (unused in frontend connect)
    mock(() => serviceObj), // getService returns our shared service object
  ]
})

mock.module('@webext-core/proxy-service', () => ({
  defineProxyService: mockDefineProxyService,
}))

// Now import the module under test
const connectModule = await import('./connect')
const { getBackendServiceWithRetry, getBackendService } = connectModule as any

interface CounterState {
  count: number
}

describe('frontend connect helpers', () => {
  beforeEach(() => {
    mockDefineProxyService.mockClear()
    // Reset service object between tests
    for (const k of Object.keys(serviceObj)) delete (serviceObj as any)[k]
  })

  test('getBackendService returns raw service without probing', () => {
    serviceObj.fetchInitialState = mock(
      async () => ({ count: 1 }) as CounterState,
    )
    const svc = getBackendService('testStore')
    expect(typeof svc.fetchInitialState).toBe('function')
    // Ensure no probe was executed
    expect(serviceObj.fetchInitialState.mock.calls.length).toBe(0)
  })

  test('getBackendServiceWithRetry resolves when fetchInitialState succeeds', async () => {
    serviceObj.fetchInitialState = mock(
      async () => ({ count: 1 }) as CounterState,
    )
    const svc = await getBackendServiceWithRetry('testStore', {
      retries: 0,
    })
    expect(svc).toBe(serviceObj)
    expect(serviceObj.fetchInitialState).toHaveBeenCalledTimes(1)
  })

  test('getBackendServiceWithRetry retries on failure then succeeds', async () => {
    const err = new Error('not ready')
    serviceObj.fetchInitialState = mock(async () => {
      // Fail first two attempts, then succeed
      if (serviceObj.fetchInitialState.mock.calls.length < 2) throw err
      return { count: 2 } as CounterState
    })
    const svc = await getBackendServiceWithRetry('testStore', {
      retries: 5,
      baseMs: 1,
    })
    expect(svc).toBe(serviceObj)
    // At least one retry should have happened
    expect(
      serviceObj.fetchInitialState.mock.calls.length,
    ).toBeGreaterThanOrEqual(2)
  })

  test('getBackendServiceWithRetry throws after exceeding retries', async () => {
    const err = new Error('still not ready')
    serviceObj.fetchInitialState = mock(async () => {
      throw err
    })
    let thrown: unknown
    try {
      await getBackendServiceWithRetry('testStore', {
        retries: 1,
        baseMs: 1,
      })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBe(err)
    expect(
      serviceObj.fetchInitialState.mock.calls.length,
    ).toBeGreaterThanOrEqual(2)
  })

  test('getBackendServiceWithRetry reloads on context invalidation', async () => {
    const err = new Error('Extension context invalidated.')
    serviceObj.fetchInitialState = mock(async () => {
      throw err
    })
    const originalWin = (globalThis as any).window
    const reload = mock(() => {})
    ;(globalThis as any).window = { location: { reload } } as any
    let thrown: unknown
    try {
      await getBackendServiceWithRetry('testStore', {
        retries: 0,
        baseMs: 1,
      })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBe(err)
    expect(reload).toHaveBeenCalledTimes(1)
    ;(globalThis as any).window = originalWin
  })
})
