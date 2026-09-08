import { useEffect, useState } from 'react'
import { InputPanel } from './components/InputPanel'
import { Reader } from './components/Reader'
import { Transport } from './components/Transport'
import { usePlayer } from './store'

const HTML_FILE = /\.(xhtml|html?|htm)$/i
const PDF_FILE = /\.pdf$/i

export function App() {
  const initVoices = usePlayer((s) => s.initVoices)
  const toggle = usePlayer((s) => s.toggle)
  const loadHtml = usePlayer((s) => s.loadHtml)
  const loadPdf = usePlayer((s) => s.loadPdf)
  const docTitle = usePlayer((s) => s.doc?.title ?? 'Lector Audio')
  const [toast, setToast] = useState('')
  const [dragging, setDragging] = useState(false)

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

  async function onDrop(e: React.DragEvent<HTMLDivElement>): Promise<void> {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (PDF_FILE.test(file.name)) {
      void loadPdf({ kind: 'bytes', bytes: await file.arrayBuffer(), label: file.name })
    } else if (HTML_FILE.test(file.name)) {
      void loadHtml({ kind: 'html', html: await file.text(), label: file.name })
    } else {
      setToast('Suelta un PDF o un archivo HTML')
      window.setTimeout(() => setToast(''), 2600)
    }
  }

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={onDrop}
    >
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

      {dragging && (
        <div className="dropzone">
          <div className="dropzone__box">Suelta un archivo HTML para leerlo</div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
