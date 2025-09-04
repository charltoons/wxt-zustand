import { describe, expect, mock, test } from 'bun:test'
import type { WXTStorageArea } from '../types'

// Mock WXT storage
const mockStorage = {
  getItem: mock(() => Promise.resolve(null)),
  setItem: mock(() => Promise.resolve()),
  getItems: mock(() => Promise.resolve({})),
  setItems: mock(() => Promise.resolve()),
  watch: mock(() => () => {}),
}

// Mock the WXT storage module
mock.module('wxt/utils/storage', () => ({
  storage: mockStorage,
}))

// Import the functions after mocking
const { createStorageKey } = await import('./index')

describe('Basic Storage Functions', () => {
  test('createStorageKey works correctly', () => {
    const key = createStorageKey('testStore')

    expect(key.key).toBe('local:wxt-zustand:testStore:state')
    expect(key.area).toBe('local')
    expect(key.storeName).toBe('testStore')
  })

  test('createStorageKey with different areas', () => {
    const areas: WXTStorageArea[] = ['local', 'session', 'sync', 'managed']

    areas.forEach((area) => {
      const key = createStorageKey('testStore', area)
      expect(key.key).toBe(`${area}:wxt-zustand:testStore:state`)
      expect(key.area).toBe(area)
    })
  })
})
