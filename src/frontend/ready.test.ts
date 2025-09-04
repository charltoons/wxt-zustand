import { describe, expect, test } from 'bun:test'
import type { StoreApi } from 'zustand'
import { createStore } from 'zustand/vanilla'

import {
  __readinessSizeFor,
  cleanupStoreReadiness,
  getStoreReadiness,
  setStoreReadiness,
} from './ready'

interface S {
  a: number
}

describe('frontend readiness registry', () => {
  test('caches and returns readiness per store+name', async () => {
    const store: StoreApi<S> = createStore<S>(() => ({ a: 1 }))

    expect(getStoreReadiness('alpha', store)).toBeUndefined()
    expect(__readinessSizeFor(store)).toBe(0)

    const p = Promise.resolve()
    setStoreReadiness('alpha', store, p)

    expect(getStoreReadiness('alpha', store)).toBe(p)
    expect(__readinessSizeFor(store)).toBe(1)

    await getStoreReadiness('alpha', store)
  })

  test('cleanup single store name entry', () => {
    const store: StoreApi<S> = createStore<S>(() => ({ a: 1 }))
    setStoreReadiness('alpha', store, Promise.resolve())
    expect(__readinessSizeFor(store)).toBe(1)

    cleanupStoreReadiness(store, 'alpha')
    expect(getStoreReadiness('alpha', store)).toBeUndefined()
    expect(__readinessSizeFor(store)).toBe(0)
  })

  test('cleanup all entries for store', () => {
    const store: StoreApi<S> = createStore<S>(() => ({ a: 1 }))
    setStoreReadiness('a', store, Promise.resolve())
    setStoreReadiness('b', store, Promise.resolve())
    expect(__readinessSizeFor(store)).toBe(2)

    cleanupStoreReadiness(store)
    expect(getStoreReadiness('a', store)).toBeUndefined()
    expect(getStoreReadiness('b', store)).toBeUndefined()
    expect(__readinessSizeFor(store)).toBe(0)
  })
})
