import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { StoreApi } from 'zustand'

const readyMod = await import('./ready')
const {
  wxtZustandStoreReady,
  __setReadyImplementations,
  __resetReadyImplementations,
} = readyMod as any

// Shared mocks
const connectAndFetchInitialState = mock(async (_storeName: string) => ({
  service: {} as any,
  initialState: { a: 100 },
}))

const setupBidirectionalSync = mock(() => ({
  service: {} as any,
  unsubscribeLocal: () => {},
  unwatchRemote: () => {},
  cleanup: () => {},
}))

interface S {
  a: number
}

function makeFakeStore(initial: S): StoreApi<S> {
  let state = initial
  const subs = new Set<(s: S, p: S) => void>()
  return {
    getState: () => state,
    getInitialState: (() => initial) as any,
    setState: ((partial: S, replace?: boolean) => {
      const prev = state
      state = replace
        ? (partial as S)
        : ({ ...state, ...(partial as any) } as S)
      subs.forEach((cb) => {
        cb(state, prev)
      })
    }) as any,
    subscribe: (cb: any) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    // Unused by our code path but part of StoreApi in some typings
    destroy: (() => {}) as any,
    setStateFromDevtools: undefined as any,
  } as StoreApi<S>
}

describe('wxtZustandStoreReady orchestration', () => {
  beforeEach(() => {
    connectAndFetchInitialState.mockClear()
    setupBidirectionalSync.mockClear()
    __resetReadyImplementations()
    __setReadyImplementations({
      connectAndFetchInitialState,
      setupBidirectionalSync,
    })
  })

  test('applies initial state (replace) and wires sync once', async () => {
    const store = makeFakeStore({ a: 1 })

    await wxtZustandStoreReady('alpha', store, { storageStrategy: 'local' })

    // connect called exactly once
    expect(connectAndFetchInitialState).toHaveBeenCalledTimes(1)
    expect(((connectAndFetchInitialState as any).mock.calls[0] as any)[0]).toBe(
      'alpha',
    )

    // state replaced (not merged)
    expect(store.getState()).toEqual({ a: 100 })

    // sync wired exactly once with correct args
    expect(setupBidirectionalSync).toHaveBeenCalledTimes(1)
    const [nameArg, storeArg] =
      (setupBidirectionalSync.mock.calls[0] as any) || ([] as any)
    expect(nameArg).toBe('alpha')
    expect(storeArg).toBe(store)
  })

  test('caches readiness per store+name (no duplicate connect/sync)', async () => {
    const store = makeFakeStore({ a: 0 })

    await wxtZustandStoreReady('beta', store)
    await wxtZustandStoreReady('beta', store)

    expect(connectAndFetchInitialState).toHaveBeenCalledTimes(1)
    expect(setupBidirectionalSync).toHaveBeenCalledTimes(1)
  })

  test('parallel calls share the same readiness promise', async () => {
    // Make connect return only after a tick so both calls start before resolution
    connectAndFetchInitialState.mockImplementationOnce(
      async (_name: string) => {
        await new Promise((r) => setTimeout(r, 10))
        return { service: {} as any, initialState: { a: 5 } }
      },
    )

    const store = makeFakeStore({ a: 0 })

    await Promise.all([
      wxtZustandStoreReady('gamma', store),
      wxtZustandStoreReady('gamma', store),
    ])

    expect(connectAndFetchInitialState).toHaveBeenCalledTimes(1)
    expect(setupBidirectionalSync).toHaveBeenCalledTimes(1)
    expect(store.getState()).toEqual({ a: 5 })
  })

  test('different names have isolated readiness', async () => {
    const store = makeFakeStore({ a: 0 })

    await wxtZustandStoreReady('d1', store)
    await wxtZustandStoreReady('d2', store)

    // One connect per distinct name
    expect(connectAndFetchInitialState).toHaveBeenCalledTimes(2)
    expect(setupBidirectionalSync).toHaveBeenCalledTimes(2)
  })
})
