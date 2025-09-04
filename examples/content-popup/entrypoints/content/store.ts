import { createStore } from 'zustand/vanilla'

export type CounterState = {
  count: number
  increment: () => void
  decrement: () => void
}

export const counterStore = createStore<CounterState>((set, _get) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  decrement: () => set((s) => ({ count: s.count - 1 })),
}))
