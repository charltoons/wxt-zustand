import { useStore } from 'zustand'
import reactLogo from '@/assets/react.svg'
import wxtLogo from '@/public/wxt.svg'
import './App.css'
import { counterStore } from './store'

function App() {
  const count = useStore(counterStore, (s) => s.count)
  const increment = useStore(counterStore, (s) => s.increment)
  const decrement = useStore(counterStore, (s) => s.decrement)

  return (
    <>
      <div>
        <a href='https://wxt.dev' target='_blank' rel='noopener'>
          <img src={wxtLogo} className='logo' alt='WXT logo' />
        </a>
        <a href='https://react.dev' target='_blank' rel='noopener'>
          <img src={reactLogo} className='logo react' alt='React logo' />
        </a>
      </div>
      <h1>WXT + React + Zustand</h1>
      <div className='card'>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type='button' onClick={decrement}>
            -
          </button>
          <span>count is {count}</span>
          <button type='button' onClick={increment}>
            +
          </button>
        </div>
        <p>Store backed by background and persisted via local storage</p>
      </div>
      <p className='read-the-docs'>
        Click on the WXT and React logos to learn more
      </p>
    </>
  )
}

export default App
