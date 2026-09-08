import { useState } from 'react'
import { usePlayer } from '../store'

function normalizeUrl(raw: string): string {
  const u = raw.trim()
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

export function InputPanel() {
  const [draft, setDraft] = useState('')
  const [url, setUrl] = useState('')
  const loadText = usePlayer((s) => s.loadText)
  const loadHtml = usePlayer((s) => s.loadHtml)
  const loadPdf = usePlayer((s) => s.loadPdf)
  const clearError = usePlayer((s) => s.clearError)
  const busy = usePlayer((s) => s.busy)
  const loadError = usePlayer((s) => s.loadError)
  const apiChars = usePlayer((s) => s.apiChars)

  async function openFile(): Promise<void> {
    const path = await window.api.pickDocument()
    if (!path) return
    if (/\.pdf$/i.test(path)) void loadPdf({ kind: 'file', path })
    else void loadHtml({ kind: 'file', path })
  }

  function readUrl(): void {
    if (url.trim()) void loadHtml({ kind: 'url', url: normalizeUrl(url) })
  }

  return (
    <aside className="input">
      <div className="input__label">Entrada</div>

      <textarea
        className="input__textarea"
        placeholder="Pega aquí tu texto…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft.trim()) loadText(draft)
        }}
      />
      <button type="button" className="btn" onClick={() => loadText(draft)} disabled={!draft.trim()}>
        Cargar texto
      </button>

      <button
        type="button"
        className="btn btn--ghost"
        onClick={openFile}
        disabled={busy}
        title="Abrir un archivo PDF o HTML"
      >
        Abrir PDF / HTML…
      </button>

      <div className="input__url">
        <input
          className="input__field"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') readUrl()
          }}
        />
        <button type="button" className="btn btn--ghost" onClick={readUrl} disabled={busy || !url.trim()}>
          Leer
        </button>
      </div>

      <div className="input__drop">
        {busy ? 'Procesando…' : 'Arrastra un PDF o HTML a cualquier parte de la ventana'}
      </div>

      {loadError && (
        <div className="input__error">
          <span>{loadError}</span>
          <button type="button" onClick={clearError} aria-label="Descartar">
            ✕
          </button>
        </div>
      )}

      <div className="input__stats">
        <div className="input__stat">
          <span>Caracteres a la API</span>
          <b>{apiChars.toLocaleString('es-ES')}</b>
        </div>
        <div className="input__stat">
          <span>Caché de audio</span>
          <b>0 MB</b>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          style={{ height: 34 }}
          disabled
          title="Próximamente — paso 6 del brief"
        >
          Ajustes…
        </button>
      </div>
    </aside>
  )
}
