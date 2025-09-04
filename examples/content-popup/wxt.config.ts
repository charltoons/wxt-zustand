import { fileURLToPath } from 'node:url'
import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  webExt: {
    startUrls: ['https://www.google.com/'],
  },
  // Allow importing library from repo root dist via alias
  vite: () => ({
    resolve: {
      alias: {
        '@wxt-zustand': fileURLToPath(
          new URL('../../dist/index.js', import.meta.url),
        ),
        // Force single React/ReactDOM instance from this example
        react: fileURLToPath(
          new URL('./node_modules/react/index.js', import.meta.url),
        ),
        'react-dom': fileURLToPath(
          new URL('./node_modules/react-dom/index.js', import.meta.url),
        ),
        // Ensure zustand resolves from this example to avoid cross-root duplication
        zustand: fileURLToPath(
          new URL('./node_modules/zustand/index.js', import.meta.url),
        ),
        'zustand/react': fileURLToPath(
          new URL('./node_modules/zustand/react.mjs', import.meta.url),
        ),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      fs: {
        allow: ['..', '../../..'],
      },
    },
  }),
  manifest: {
    // Required, don't open popup, only action
    action: {},
    permissions: ['storage'],
  },
})
