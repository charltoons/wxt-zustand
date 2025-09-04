import * as wxtZustand from '@wxt-zustand'
import { createStore } from 'zustand/vanilla'

type CounterState = { count: number }

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id })

  // Register the counter store for frontend connections and persistence
  const counterStore = createStore<CounterState>(() => ({ count: 0 }))
  ;(async () => {
    try {
      await wxtZustand.initWXTZustandStoreBackend<CounterState>(
        'counter',
        counterStore,
        { storageStrategy: 'local' },
      )
      console.log('WXT-Zustand background store registered: counter')
    } catch (err) {
      console.error('Failed to init WXT-Zustand backend store:', err)
    }
  })()

  // Clicking the browser action toggles mounting the content UI
  ;(browser.action ?? browser.browserAction).onClicked.addListener(
    async (tab) => {
      console.log('browser action triggered,', tab)
      if (tab.id) {
        await browser.tabs.sendMessage(tab.id, { type: 'MOUNT_UI' })
      }
    },
  )
})
