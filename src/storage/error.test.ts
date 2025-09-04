import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock WXT storage before importing the module
const mockStorage: any = {
  getItem: mock(() => Promise.resolve(null)),
  setItem: mock(() => Promise.resolve()),
  removeItem: mock(() => Promise.resolve()),
  defineItem: mock((key: string, opts: any) => ({
    key,
    opts,
    getValue: mock(() => Promise.resolve(opts?.fallback ?? null)),
    setValue: mock(() => Promise.resolve()),
    remove: mock(() => Promise.resolve()),
  })),
}

mock.module('wxt/utils/storage', () => ({ storage: mockStorage }))

// Now import the functions after mocking
const {
  saveStateToStorage,
  saveStateToVersionedItem,
  handleCorruptedState,
  clearStoreFromStorage,
  createStorageKey,
} = await import('./index')

describe('Storage Error Handling & Cleanup', () => {
  beforeEach(() => {
    mockStorage.getItem.mockClear()
    mockStorage.setItem.mockClear()
    mockStorage.removeItem.mockClear()
    mockStorage.defineItem.mockClear()
  })

  describe('handleCorruptedState', () => {
    test('should backup and remove corrupted item', async () => {
      const originalError = console.error
      const originalWarn = console.warn
      const consoleError = mock(console.error)
      const consoleWarn = mock(console.warn)
      console.error = consoleError as any
      console.warn = consoleWarn as any

      const corruptedValue = '{"key":"invalid}'
      mockStorage.getItem.mockResolvedValue(corruptedValue)

      const item = {
        key: 'local:wxt-zustand:corrupt-store:state',
        remove: mock(() => Promise.resolve()),
      }
      const error = new Error('Unexpected token')

      await handleCorruptedState(item as any, error)

      expect(consoleError).toHaveBeenCalledWith(
        'WXT Zustand Store item with key "local:wxt-zustand:corrupt-store:state" is corrupted.',
        error,
      )
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Backing up corrupted state to'),
      )
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        expect.stringContaining(
          'local:wxt-zustand:corrupt-store:state:corrupted-',
        ),
        corruptedValue,
      )
      expect(item.remove).toHaveBeenCalled()

      console.error = originalError
      console.warn = originalWarn
    })
  })

  describe('saveStateToStorage quota handling', () => {
    test('should log specific error on QUOTA_BYTES', async () => {
      const originalError = console.error
      const consoleError = mock(console.error)
      console.error = consoleError as any

      const quotaError = new Error('QUOTA_BYTES_PER_ITEM quota exceeded')
      mockStorage.setItem.mockRejectedValue(quotaError)

      const storageKey = createStorageKey('quota-store')
      await saveStateToStorage(storageKey, { data: 'some data' })

      expect(consoleError).toHaveBeenCalledWith(
        'WXT Zustand Store "quota-store" has exceeded the storage quota for the local area.',
        quotaError,
      )

      console.error = originalError
    })
  })

  describe('saveStateToVersionedItem quota handling', () => {
    test('should log specific error on QUOTA_BYTES', async () => {
      const originalError = console.error
      const consoleError = mock(console.error)
      console.error = consoleError as any

      const quotaError = new Error('QUOTA_BYTES quota exceeded')
      const item = {
        key: 'local:wxt-zustand:versioned-quota-store:state',
        setValue: mock(() => Promise.reject(quotaError)),
      } as any

      await saveStateToVersionedItem(item as any, { data: 'some data' })

      expect(consoleError).toHaveBeenCalledWith(
        'WXT Zustand Store item with key "local:wxt-zustand:versioned-quota-store:state" has exceeded the storage quota.',
        quotaError,
      )

      console.error = originalError
    })
  })

  describe('clearStoreFromStorage', () => {
    test('should call removeItem with the correct key', async () => {
      await clearStoreFromStorage('clear-store', 'session')

      expect(mockStorage.removeItem).toHaveBeenCalledWith(
        'session:wxt-zustand:clear-store:state',
      )
    })

    test('should handle errors during removal', async () => {
      const originalError = console.error
      const consoleError = mock(console.error)
      console.error = consoleError as any

      const removalError = new Error('Could not remove item')
      mockStorage.removeItem.mockRejectedValue(removalError)

      await clearStoreFromStorage('clear-store-fail')

      expect(consoleError).toHaveBeenCalledWith(
        'Error clearing WXT Zustand Store "clear-store-fail" from local storage.',
        removalError,
      )

      console.error = originalError
    })
  })
})
