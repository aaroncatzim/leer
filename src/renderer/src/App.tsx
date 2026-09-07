import { useEffect, useState } from 'react'
import { InputPanel } from './components/InputPanel'
import { Reader } from './components/Reader'
import { Transport } from './components/Transport'
import { usePlayer } from './store'

export function App() {
  const initVoices = usePlayer((s) => s.initVoices)
  const toggle = usePlayer((s) => s.toggle)
  const docTitle = usePlayer((s) => s.doc?.title ?? 'Lector Audio')
  const [toast, setToast] = useState('')

  useEffect(() => {
    void initVoices()
  }, [initVoices])

  useEffect(() => {
    return window.api.on('ui:open-settings', () => {
      setToast('Ajustes — llega en el paso 6 del brief')
      window.setTimeout(() => setToast(''), 2600)
    })
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const el = e.target as HTMLElement | null
      const typing = el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)
      if (e.code === 'Space' && !typing) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  return (
    <div className="app">
      <header className="titlebar">
        <div className="titlebar__lights">
          <span />
          <span />
          <span />
        </div>
        <div className="titlebar__title">{docTitle}</div>
        <div className="titlebar__spacer" />
      </header>

      <div className="body">
        <InputPanel />
        <Reader />
      </div>

      <Transport />

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 92,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--ink)',
            color: '#fff',
            font: '600 12px var(--font-ui)',
            padding: '8px 14px',
            borderRadius: 8,
            boxShadow: '0 4px 14px rgba(0,0,0,.25)'
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
