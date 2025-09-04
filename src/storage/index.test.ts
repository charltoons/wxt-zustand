import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { WXTStorageArea } from '../types'

// Mock WXT storage before importing the module
const itemState = new Map<string, any>()
const itemWatchers = new Map<string, Set<(n: any, o: any) => void>>()

const mockStorage: any = {
  getItem: mock(() => Promise.resolve(null)),
  setItem: mock(() => Promise.resolve()),
  getItems: mock(() => Promise.resolve({})),
  setItems: mock(() => Promise.resolve()),
  watch: mock(() => () => {}), // Returns unwatch function
  defineItem: mock((key: string, opts: any) => {
    return {
      key,
      async getValue() {
        if (itemState.has(key)) return itemState.get(key)
        return opts?.fallback ?? null
      },
      async setValue(v: any) {
        const oldVal = itemState.get(key) ?? null
        itemState.set(key, v)
        const set = itemWatchers.get(key)
        if (set) {
          for (const cb of set) cb(v, oldVal)
        }
      },
      watch(cb: (n: any, o: any) => void) {
        let set = itemWatchers.get(key)
        if (!set) {
          set = new Set()
          itemWatchers.set(key, set)
        }
        set.add(cb)
        return () => {
          set?.delete(cb)
        }
      },
      async remove() {
        itemState.delete(key)
      },
    }
  }),
}

// Mock the WXT storage module to avoid requiring a browser extension environment
mock.module('wxt/utils/storage', () => ({
  storage: mockStorage,
}))

// Now import the functions after mocking
const {
  createStorageKey,
  createLocalStorageKey,
  createSessionStorageKey,
  createSyncStorageKey,
  loadStateFromStorage,
  saveStateToStorage,
  createStorageWatcher,
  validateStoragePermissions,
  loadMultipleStatesFromStorage,
  saveMultipleStatesToStorage,
  defineVersionedStoreItem,
  loadStateFromVersionedItem,
  saveStateToVersionedItem,
  createVersionedItemWatcher,
  createVersionedStorageKey,
} = await import('./index')

describe('createStorageKey', () => {
  test('should create storage key with default area', () => {
    const key = createStorageKey('testStore')

    expect(key).toEqual({
      key: 'local:wxt-zustand:testStore:state',
      area: 'local',
      storeName: 'testStore',
      __type: undefined,
    })
  })

  test('should create storage key with specified area', () => {
    const areas: WXTStorageArea[] = ['local', 'session', 'sync', 'managed']

    areas.forEach((area) => {
      const key = createStorageKey('testStore', area)
      expect(key.key).toBe(`${area}:wxt-zustand:testStore:state`)
      expect(key.area).toBe(area)
      expect(key.storeName).toBe('testStore')
    })
  })

  test('should create type-safe storage key', () => {
    interface TestState {
      count: number
      name: string
    }

    const key = createStorageKey<TestState>('typedStore', 'session')

    expect(key.key).toBe('session:wxt-zustand:typedStore:state')
    expect(key.area).toBe('session')
    expect(key.storeName).toBe('typedStore')
    // Type should be inferred but we can't test TypeScript types in runtime
  })

  test('should create strategy-specific keys via helpers', () => {
    const localKey = createLocalStorageKey('s1')
    const sessionKey = createSessionStorageKey('s2')
    const syncKey = createSyncStorageKey('s3')

    expect(localKey.key).toBe('local:wxt-zustand:s1:state')
    expect(localKey.area).toBe('local')
    expect(localKey.storeName).toBe('s1')

    expect(sessionKey.key).toBe('session:wxt-zustand:s2:state')
    expect(sessionKey.area).toBe('session')
    expect(sessionKey.storeName).toBe('s2')

    expect(syncKey.key).toBe('sync:wxt-zustand:s3:state')
    expect(syncKey.area).toBe('sync')
    expect(syncKey.storeName).toBe('s3')
  })
})

describe('loadStateFromStorage', () => {
  beforeEach(() => {
    mockStorage.getItem.mockClear()
    itemState.clear()
    itemWatchers.clear()
  })

  test('should load and deserialize state successfully', async () => {
    const testState = { count: 42, name: 'test' }
    const serializedState = JSON.stringify(testState)
    mockStorage.getItem.mockResolvedValueOnce(serializedState)

    const storageKey = createStorageKey('testStore')
    const result = await loadStateFromStorage(storageKey)

    expect(mockStorage.getItem).toHaveBeenCalledWith(
      'local:wxt-zustand:testStore:state',
    )
    expect(result).toEqual(testState)
  })

  test('should return undefined when value is null', async () => {
    mockStorage.getItem.mockResolvedValueOnce(null)

    const storageKey = createStorageKey('testStore')
    const result = await loadStateFromStorage(storageKey)

    expect(result).toBeUndefined()
  })

  test('should return undefined when value is undefined', async () => {
    mockStorage.getItem.mockResolvedValueOnce(undefined)

    const storageKey = createStorageKey('testStore')
    const result = await loadStateFromStorage(storageKey)

    expect(result).toBeUndefined()
  })

  test('should handle deserialization errors gracefully', async () => {
    const originalError = console.error
    const consoleMessages: any[] = []
    console.error = (...args: any[]) => {
      consoleMessages.push(args)
    }

    mockStorage.getItem.mockResolvedValueOnce('invalid json')

    const storageKey = createStorageKey('testStore')
    const result = await loadStateFromStorage(storageKey)

    expect(result).toBeUndefined()
    expect(consoleMessages.length).toBeGreaterThan(0)
    expect(consoleMessages[0][0]).toContain(
      'Error loading WXT Zustand Store "testStore" state',
    )

    console.error = originalError
  })

  test('should handle storage errors gracefully', async () => {
    const originalError = console.error
    const consoleMessages: any[] = []
    console.error = (...args: any[]) => {
      consoleMessages.push(args)
    }

    const storageError = new Error('Storage quota exceeded')
    mockStorage.getItem.mockRejectedValueOnce(storageError)

    const storageKey = createStorageKey('testStore')
    const result = await loadStateFromStorage(storageKey)

    expect(result).toBeUndefined()
    expect(consoleMessages.length).toBeGreaterThan(0)
    expect(consoleMessages[0][0]).toContain(
      'Error loading WXT Zustand Store "testStore" state',
    )
    expect(consoleMessages[0][1]).toBe(storageError)

    console.error = originalError
  })

  test('should use custom deserializer', async () => {
    const customData = 'custom-format-data'
    const expectedResult = { custom: true }
    const customDeserializer = mock(() => expectedResult)

    mockStorage.getItem.mockResolvedValueOnce(customData)

    const storageKey = createStorageKey('testStore')
    const result = await loadStateFromStorage(storageKey, customDeserializer)

    expect(customDeserializer).toHaveBeenCalledWith(customData)
    expect(result).toEqual(expectedResult)
  })
})

describe('saveStateToStorage', () => {
  beforeEach(() => {
    mockStorage.setItem.mockClear()
    itemState.clear()
    itemWatchers.clear()
  })

  test('should serialize and save state successfully', async () => {
    const testState = { count: 42, name: 'test' }
    const storageKey = createStorageKey('testStore')

    await saveStateToStorage(storageKey, testState)

    expect(mockStorage.setItem).toHaveBeenCalledWith(
      'local:wxt-zustand:testStore:state',
      JSON.stringify(testState),
    )
  })

  test('should handle storage errors gracefully', async () => {
    const originalError = console.error
    const calls: any[] = []
    console.error = ((...args: any[]) => {
      calls.push(args)
    }) as any
    const storageError = new Error('Storage quota exceeded')
    mockStorage.setItem.mockRejectedValueOnce(storageError)

    const testState = { count: 42 }
    const storageKey = createStorageKey('testStore')

    await saveStateToStorage(storageKey, testState)

    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0][0]).toContain(
      'Error saving WXT Zustand Store "testStore" state',
    )
    expect(calls[0][1]).toBe(storageError)
    console.error = originalError
  })

  test('should use custom serializer', async () => {
    const testState = { count: 42 }
    const customSerialized = 'custom-serialized-data'
    const customSerializer = mock(() => customSerialized)

    const storageKey = createStorageKey('testStore')

    await saveStateToStorage(storageKey, testState, customSerializer)

    expect(customSerializer).toHaveBeenCalledWith(testState)
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      'local:wxt-zustand:testStore:state',
      customSerialized,
    )
  })
})

describe('createStorageWatcher', () => {
  let unwatch: () => void

  beforeEach(() => {
    unwatch = mock(() => {})
    mockStorage.watch.mockClear().mockReturnValue(unwatch)
    itemState.clear()
    itemWatchers.clear()
  })

  test('should create storage watcher with callback', () => {
    const storageKey = createStorageKey('testStore')
    const callback = mock(() => {})

    const watcher = createStorageWatcher(storageKey, callback)

    expect(mockStorage.watch).toHaveBeenCalledWith(
      'local:wxt-zustand:testStore:state',
      expect.any(Function),
    )
    expect(watcher.key).toBe(storageKey)
    expect(watcher.callback).toBe(callback)
    expect(watcher.unwatch).toBe(unwatch)
  })

  test('should handle storage changes with deserialization', () => {
    const storageKey = createStorageKey('testStore')
    const callback = mock(() => {})

    createStorageWatcher(storageKey, callback)

    // Get the internal callback passed to storage.watch
    const [[, internalCallback]] = mockStorage.watch.mock.calls

    const oldState = { count: 1 }
    const newState = { count: 2 }

    // Simulate storage change
    internalCallback(JSON.stringify(newState), JSON.stringify(oldState))

    expect(callback).toHaveBeenCalledWith(newState, oldState)
  })

  test('should handle null values in storage changes', () => {
    const storageKey = createStorageKey('testStore')
    const callback = mock(() => {})

    createStorageWatcher(storageKey, callback)

    const [[, internalCallback]] = mockStorage.watch.mock.calls

    // Simulate storage change with null values
    internalCallback(null, JSON.stringify({ count: 1 }))

    expect(callback).toHaveBeenCalledWith(undefined, { count: 1 })
  })

  test('should handle deserialization errors gracefully', () => {
    const originalWarn = console.warn
    let warnCount = 0
    console.warn = (() => {
      warnCount++
    }) as any
    const storageKey = createStorageKey('testStore')
    const callback = mock(() => {})

    createStorageWatcher(storageKey, callback)

    const [[, internalCallback]] = mockStorage.watch.mock.calls

    // Simulate storage change with invalid JSON
    internalCallback('invalid json', 'also invalid')

    expect(callback).toHaveBeenCalledWith(undefined, undefined)
    expect(warnCount).toBe(2) // Once for each invalid JSON
    console.warn = originalWarn
  })

  test('should use custom deserializer', () => {
    const storageKey = createStorageKey('testStore')
    const callback = mock(() => {})
    const customDeserializer = mock((value: string) => ({ custom: value }))

    createStorageWatcher(storageKey, callback, customDeserializer)

    const [[, internalCallback]] = mockStorage.watch.mock.calls

    internalCallback('test-data', 'old-data')

    expect(customDeserializer).toHaveBeenCalledWith('test-data')
    expect(customDeserializer).toHaveBeenCalledWith('old-data')
    expect(callback).toHaveBeenCalledWith(
      { custom: 'test-data' },
      { custom: 'old-data' },
    )
  })
})

describe('validateStoragePermissions', () => {
  test('should not throw error (WXT handles permissions automatically)', () => {
    expect(() => validateStoragePermissions()).not.toThrow()
  })
})

describe('loadMultipleStatesFromStorage', () => {
  beforeEach(() => {
    mockStorage.getItems.mockClear()
    itemState.clear()
    itemWatchers.clear()
  })

  test('should load multiple states successfully', async () => {
    const store1Key = createStorageKey('store1')
    const store2Key = createStorageKey('store2')
    const storageKeys = [store1Key, store2Key]

    const store1State = { count: 1 }
    const store2State = { count: 2 }

    mockStorage.getItems.mockResolvedValueOnce({
      'local:wxt-zustand:store1:state': JSON.stringify(store1State),
      'local:wxt-zustand:store2:state': JSON.stringify(store2State),
    })

    const result = await loadMultipleStatesFromStorage(storageKeys)

    expect(mockStorage.getItems).toHaveBeenCalledWith([
      { key: 'local:wxt-zustand:store1:state' },
      { key: 'local:wxt-zustand:store2:state' },
    ])

    expect(result.get('store1')).toEqual(store1State)
    expect(result.get('store2')).toEqual(store2State)
  })

  test('should handle missing and invalid states', async () => {
    const originalWarn = console.warn
    const warnCalls: any[] = []
    console.warn = ((...args: any[]) => {
      warnCalls.push(args)
    }) as any
    const store1Key = createStorageKey('store1')
    const store2Key = createStorageKey('store2')
    const store3Key = createStorageKey('store3')
    const storageKeys = [store1Key, store2Key, store3Key]

    mockStorage.getItems.mockResolvedValueOnce({
      'local:wxt-zustand:store1:state': JSON.stringify({ count: 1 }),
      'local:wxt-zustand:store2:state': 'invalid json',
      // store3 missing
    })

    const result = await loadMultipleStatesFromStorage(storageKeys)

    expect(result.get('store1')).toEqual({ count: 1 })
    expect(result.get('store2')).toBeUndefined()
    expect(result.get('store3')).toBeUndefined()
    expect(warnCalls.length).toBeGreaterThan(0)
    expect(warnCalls[0][0]).toContain('Error deserializing state for "store2"')
    expect(warnCalls[0][1]).toBeInstanceOf(Error)
    expect(warnCalls[0][2]).toBe('invalid json')
    console.warn = originalWarn
  })

  test('should handle storage errors gracefully', async () => {
    const originalError = console.error
    const errorCalls: any[] = []
    console.error = ((...args: any[]) => {
      errorCalls.push(args)
    }) as any
    const storageError = new Error('Storage error')
    mockStorage.getItems.mockRejectedValueOnce(storageError)

    const storageKeys = [createStorageKey('store1')]
    const result = await loadMultipleStatesFromStorage(storageKeys)

    expect(result).toEqual(new Map())
    expect(errorCalls.length).toBeGreaterThan(0)
    expect(errorCalls[0][0]).toBe('Error loading multiple states from storage:')
    expect(errorCalls[0][1]).toBe(storageError)
    console.error = originalError
  })
})

describe('saveMultipleStatesToStorage', () => {
  beforeEach(() => {
    mockStorage.setItems.mockClear()
    itemState.clear()
    itemWatchers.clear()
  })

  test('should save multiple states successfully', async () => {
    const states = new Map([
      ['store1', { count: 1 }],
      ['store2', { count: 2 }],
    ])

    await saveMultipleStatesToStorage(states, 'session')

    expect(mockStorage.setItems).toHaveBeenCalledWith([
      {
        key: 'session:wxt-zustand:store1:state',
        value: JSON.stringify({ count: 1 }),
      },
      {
        key: 'session:wxt-zustand:store2:state',
        value: JSON.stringify({ count: 2 }),
      },
    ])
  })

  test('should handle storage errors gracefully', async () => {
    const originalError = console.error
    const errorCalls: any[] = []
    console.error = ((...args: any[]) => {
      errorCalls.push(args)
    }) as any
    const storageError = new Error('Storage error')
    mockStorage.setItems.mockRejectedValueOnce(storageError)

    const states = new Map([['store1', { count: 1 }]])
    await saveMultipleStatesToStorage(states)

    expect(errorCalls.length).toBeGreaterThan(0)
    expect(errorCalls[0][0]).toBe('Error saving multiple states to storage:')
    expect(errorCalls[0][1]).toBe(storageError)
    console.error = originalError
  })

  test('should use custom serializer', async () => {
    const states = new Map([['store1', { count: 1 }]])
    const customSerializer = mock(() => 'custom-serialized')

    await saveMultipleStatesToStorage(states, 'local', customSerializer)

    expect(customSerializer).toHaveBeenCalledWith({ count: 1 })
    expect(mockStorage.setItems).toHaveBeenCalledWith([
      { key: 'local:wxt-zustand:store1:state', value: 'custom-serialized' },
    ])
  })
})

describe('versioned storage item (defineItem)', () => {
  beforeEach(() => {
    itemState.clear()
    itemWatchers.clear()
    mockStorage.defineItem.mockClear()
  })

  test('should create versioned item and save/load', async () => {
    const item = defineVersionedStoreItem<{ c: number }>('vstore', {
      area: 'local',
      version: 2,
      fallback: { c: 0 },
    })
    const pre = await loadStateFromVersionedItem(item)
    expect(pre).toEqual({ c: 0 })
    await saveStateToVersionedItem(item, { c: 5 })
    const post = await loadStateFromVersionedItem(item)
    expect(post).toEqual({ c: 5 })
  })

  test('should pass version and migrations to defineItem', () => {
    const mig = { 2: (prev: any) => prev }
    defineVersionedStoreItem('vstore2', {
      area: 'sync',
      version: 2,
      migrations: mig,
    })
    const last = mockStorage.defineItem.mock.calls.at(-1)
    expect(last).toBeDefined()
    if (!last) throw new Error('expected call')
    expect(last[0]).toBe('sync:wxt-zustand:vstore2:state')
    expect((last[1] as any).version).toBe(2)
    expect((last[1] as any).migrations).toBe(mig)
  })

  test('should watch versioned item for changes', async () => {
    const item = defineVersionedStoreItem<{ n: number }>('vstore3', {
      version: 1,
    })
    const cb = mock(() => {})
    const { unwatch } = createVersionedItemWatcher(item, cb)
    await saveStateToVersionedItem(item, { n: 10 })
    expect(cb).toHaveBeenCalledWith({ n: 10 }, undefined)
    unwatch()
  })

  test('should handle corrupted reads gracefully', async () => {
    const originalError = console.error
    const originalWarn = console.warn
    const consoleError = mock(console.error)
    const consoleWarn = mock(console.warn)
    console.error = consoleError as any
    console.warn = consoleWarn as any

    const corruptedItem = {
      key: 'local:wxt-zustand:vstore4:state',
      getValue: async () => {
        throw new Error('corrupted')
      },
      remove: mock(async () => {}),
    }
    mockStorage.defineItem.mockReturnValueOnce(corruptedItem)
    mockStorage.getItem.mockResolvedValueOnce('corrupted data')

    const item = defineVersionedStoreItem('vstore4', { version: 1 })
    const val = await loadStateFromVersionedItem(item)

    expect(val).toBeUndefined()
    expect(consoleError).toHaveBeenCalledWith(
      'WXT Zustand Store item with key "local:wxt-zustand:vstore4:state" is corrupted.',
      expect.any(Error),
    )
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('Backing up corrupted state to'),
    )
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      expect.stringContaining('local:wxt-zustand:vstore4:state:corrupted-'),
      'corrupted data',
    )
    expect(corruptedItem.remove).toHaveBeenCalled()

    console.error = originalError
    console.warn = originalWarn
  })

  test('createVersionedStorageKey creates version-suffixed key', () => {
    const k = createVersionedStorageKey('sfx', 3, 'session')
    expect(k.key).toBe('session:wxt-zustand:sfx:state:v3')
    expect(k.storeName).toBe('sfx')
    expect(k.area).toBe('session')
  })
})
