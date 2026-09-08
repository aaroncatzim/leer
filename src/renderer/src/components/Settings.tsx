import { useEffect, useState } from 'react'
import { REMOTE_TTS_ENABLED } from '@shared/features'
import type { RemoteProvider, SettingsView } from '@shared/ipc'
import { usePlayer } from '../store'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function Settings() {
  const closeSettings = usePlayer((s) => s.closeSettings)
  const [view, setView] = useState<SettingsView | null>(null)
  const [draftKey, setDraftKey] = useState<Record<RemoteProvider, string>>({ elevenlabs: '', openai: '' })
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

  async function saveKey(provider: RemoteProvider): Promise<void> {
    setSaving(provider)
    try {
      await window.api.setSecret(provider, draftKey[provider])
      setDraftKey((d) => ({ ...d, [provider]: '' }))
      await refresh()
    } finally {
      setSaving('')
    }
  }

  async function clearKey(provider: RemoteProvider): Promise<void> {
    await window.api.clearSecret(provider)
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

          {REMOTE_TTS_ENABLED &&
            (['elevenlabs', 'openai'] as RemoteProvider[]).map((provider) => (
            <label className="modal__field" key={provider}>
              API key {provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'}
              <div className="modal__row">
                <input
                  type="password"
                  placeholder={view?.keys[provider].hint ?? 'Sin configurar'}
                  value={draftKey[provider]}
                  onChange={(e) => setDraftKey((d) => ({ ...d, [provider]: e.target.value }))}
                  disabled={!view?.encryptionAvailable}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => void saveKey(provider)}
                  disabled={!draftKey[provider].trim() || saving === provider}
                >
                  Guardar
                </button>
                {view?.keys[provider].configured && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => void clearKey(provider)}
                  >
                    Quitar
                  </button>
                )}
              </div>
              {provider === 'elevenlabs' && (
                <span className="modal__hint">
                  Cifrada en disco con <code>safeStorage</code>. Nunca sale del proceso principal.
                </span>
              )}
            </label>
          ))}

          <div className={REMOTE_TTS_ENABLED ? 'modal__grid' : undefined}>
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

            {REMOTE_TTS_ENABLED && (
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
            )}
          </div>

          {REMOTE_TTS_ENABLED && (
            <div className="modal__cache">
              <div>
                <div className="modal__cache-title">Caché de audio</div>
                <div className="modal__hint">{formatBytes(view?.cacheBytes ?? 0)} en disco</div>
              </div>
              <button type="button" className="btn btn--ghost" onClick={clearCache}>
                Vaciar
              </button>
            </div>
          )}
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
