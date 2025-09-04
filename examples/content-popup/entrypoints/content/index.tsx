import ReactDOM from 'react-dom/client'
import { createShadowRootUi } from '#imports'
import App from './App.tsx'
import './style.css'
import * as wxtZustand from '@wxt-zustand'
import { type CounterState, counterStore } from './store.ts'

export default defineContentScript({
  matches: ['*://*/*'],
  async main(ctx) {
    console.log('Hello content script.')

    // Ensure the local store is connected to the background and initialized
    await wxtZustand.wxtZustandStoreReady<CounterState>(
      'counter',
      counterStore,
      {
        storageStrategy: 'local',
      },
    )

    const ui = await createShadowRootUi(ctx, {
      name: 'wxt-react-example',
      position: 'inline',
      anchor: 'body',
      append: 'first',
      onMount: (container) => {
        // Don't mount react app directly on <body>
        const wrapper = document.createElement('div')
        container.append(wrapper)

        const root = ReactDOM.createRoot(wrapper)
        root.render(<App />)
        return { root, wrapper }
      },
      onRemove: (elements) => {
        elements?.root.unmount()
        elements?.wrapper.remove()
      },
    })

    browser.runtime.onMessage.addListener((event) => {
      if (event.type === 'MOUNT_UI') {
        // dynamic mount by user action via messaging.
        ui.mount()
      }
    })
  },
})
