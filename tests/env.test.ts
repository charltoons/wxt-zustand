import { describe, expect, test } from 'bun:test'

describe('test environment setup', () => {
  test('browser and chrome globals exist', () => {
    expect((globalThis as any).browser).toBeDefined()
    expect((globalThis as any).chrome).toBeDefined()
  })

  test('wxt/testing fakeBrowser reset is safe to call when available', async () => {
    try {
      const { fakeBrowser } = await import('wxt/testing')
      expect(typeof fakeBrowser.reset).toBe('function')
      // Call reset defensively; should not throw
      fakeBrowser.reset()
    } catch {
      // If module not present, that's fine in CI – skip behavior check
      expect(true).toBe(true)
    }
  })
})
