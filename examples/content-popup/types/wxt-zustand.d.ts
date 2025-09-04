declare module '@wxt-zustand' {
  export { initWXTZustandStoreBackend } from '../../../dist/background/init'
  export { wxtZustandStoreReady } from '../../../dist/frontend/ready'
  export { getBackendService } from '../../../dist/frontend/connect'
  export * from '../../../dist/types'
}
