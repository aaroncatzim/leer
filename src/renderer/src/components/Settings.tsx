import { useEffect, useState } from 'react'
import type { SettingsView } from '@shared/ipc'
import { usePlayer } from '../store'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function Settings() {
  const closeSettings = usePlayer((s) => s.closeSettings)
  const [view, setView] = useState<SettingsView | null>(null)
  const [elevenKey, setElevenKey] = useState('')
  const [chunkChars, setChunkChars] = useState('3000')
  const [saving, setSaving] = useState('')

  async function refresh(): Promise<void> {
    const v = await window.api.getSettings()
    setView(v)
    setChunkChars(String(v.chunkChars))
  }

  useEffect(() => {
    void refresh()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeSettings])

  async function saveKey(): Promise<void> {
    setSaving('elevenlabs')
    try {
      await window.api.setSecret('elevenlabs', elevenKey)
      setElevenKey('')
      await refresh()
    } finally {
      setSaving('')
    }
  }

  async function clearKey(): Promise<void> {
    await window.api.clearSecret('elevenlabs')
    await refresh()
  }

  async function saveChunk(): Promise<void> {
    const n = Math.max(500, Math.min(9000, parseInt(chunkChars, 10) || 3000))
    setView(await window.api.setSettings({ chunkChars: n }))
  }

  async function setOcrLang(lang: 'spa' | 'spa+eng'): Promise<void> {
    setView(await window.api.setSettings({ ocrLang: lang }))
  }

  async function clearCache(): Promise<void> {
    await window.api.clearAudioCache()
    await refresh()
  }

  return (
    <div className="modal" onClick={closeSettings}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ajustes">
        <div className="modal__head">
          <h2>Ajustes</h2>
          <button type="button" onClick={closeSettings} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="modal__body">
          {view && !view.encryptionAvailable && (
            <p className="modal__warn">
              El cifrado seguro del sistema no está disponible: no se pueden guardar API keys.
            </p>
          )}

          <label className="modal__field">
            API key ElevenLabs
            <div className="modal__row">
              <input
                type="password"
                placeholder={view?.keys.elevenlabs.hint ?? 'Sin configurar'}
                value={elevenKey}
                onChange={(e) => setElevenKey(e.target.value)}
                disabled={!view?.encryptionAvailable}
              />
              <button
                type="button"
                className="btn"
                onClick={saveKey}
                disabled={!elevenKey.trim() || saving === 'elevenlabs'}
              >
                Guardar
              </button>
              {view?.keys.elevenlabs.configured && (
                <button type="button" className="btn btn--ghost" onClick={clearKey}>
                  Quitar
                </button>
              )}
            </div>
            <span className="modal__hint">
              Cifrada en disco con <code>safeStorage</code>. Nunca sale del proceso principal.
            </span>
          </label>

          <label className="modal__field">
            API key OpenAI
            <div className="modal__row">
              <input type="password" placeholder="Llega en el paso 7" disabled />
            </div>
          </label>

          <div className="modal__grid">
            <label className="modal__field">
              Idioma OCR
              <select
                value={view?.ocrLang ?? 'spa'}
                onChange={(e) => void setOcrLang(e.target.value as 'spa' | 'spa+eng')}
              >
                <option value="spa">Español (spa)</option>
                <option value="spa+eng">Español + Inglés</option>
              </select>
            </label>

            <label className="modal__field">
              Tamaño de chunk
              <div className="modal__row">
                <input
                  value={chunkChars}
                  inputMode="numeric"
                  onChange={(e) => setChunkChars(e.target.value.replace(/\D/g, ''))}
                  onBlur={saveChunk}
                />
              </div>
            </label>
          </div>

          <div className="modal__cache">
            <div>
              <div className="modal__cache-title">Caché de audio</div>
              <div className="modal__hint">{formatBytes(view?.cacheBytes ?? 0)} en disco</div>
            </div>
            <button type="button" className="btn btn--ghost" onClick={clearCache}>
              Vaciar
            </button>
          </div>
        </div>

        <div className="modal__foot">
          <button type="button" className="btn" onClick={closeSettings}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
