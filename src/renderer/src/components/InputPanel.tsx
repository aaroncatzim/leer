import { useState } from 'react'
import { usePlayer } from '../store'

export function InputPanel() {
  const [draft, setDraft] = useState('')
  const loadText = usePlayer((s) => s.loadText)
  const apiChars = usePlayer((s) => s.apiChars)

  function load(): void {
    if (draft.trim()) loadText(draft)
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
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') load()
        }}
      />

      <button type="button" className="btn" onClick={load} disabled={!draft.trim()}>
        Cargar texto
      </button>

      <button type="button" className="btn btn--ghost" disabled title="Próximamente — paso 3 del brief">
        Abrir PDF / HTML
      </button>

      <div className="input__stats">
        <div className="input__stat">
          <span>Caracteres a la API</span>
          <b>{apiChars.toLocaleString('es-ES')}</b>
        </div>
        <div className="input__stat">
          <span>Caché de audio</span>
          <b>0 MB</b>
        </div>
        <button type="button" className="btn btn--ghost" style={{ height: 34 }} disabled title="Próximamente — paso 6 del brief">
          Ajustes…
        </button>
      </div>
    </aside>
  )
}
