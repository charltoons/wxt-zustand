// Global test setup for bun:test
// - Ensures minimal browser/chrome globals exist
// - Resets WXT's fake browser between tests when available
// - Restores function mocks after each test

import { afterEach, beforeAll, beforeEach, mock } from 'bun:test'

function ensureBrowserGlobals() {
  // Minimal `browser` polyfill
  if (!(globalThis as any).browser) {
    ;(globalThis as any).browser = {
      runtime: {
        getURL: (p: string) => p,
        onMessage: { addListener() {}, removeListener() {} },
      },
      storage: {
        local: {},
        session: {},
        sync: {},
        managed: {},
      },
    }
  }
  // Minimal `chrome` polyfill
  if (!(globalThis as any).chrome) {
    ;(globalThis as any).chrome = {
      runtime: { onMessage: { addListener() {}, removeListener() {} } },
      storage: { local: {}, session: {}, sync: {}, managed: {} },
    }
  }
}

let fakeBrowser: { reset: () => void } | null = null

beforeAll(async () => {
  ensureBrowserGlobals()
  try {
    // Optional: WXT testing utilities if available
    const mod = await import('wxt/testing')
    fakeBrowser = mod.fakeBrowser ?? null
  } catch {
    fakeBrowser = null
  }
})

beforeEach(() => {
  try {
    fakeBrowser?.reset?.()
  } catch {}
})

afterEach(() => {
  // Restore spies/mocks to avoid cross-test leakage
  try {
    mock.restore()
  } catch {}
})
