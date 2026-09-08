import { usePlayer, type EngineId } from '../store'

const ENGINE_LABELS: Record<EngineId, string> = {
  system: 'Sistema (offline)',
  elevenlabs: 'ElevenLabs',
  openai: 'OpenAI TTS'
}

export function Transport() {
  const doc = usePlayer((s) => s.doc)
  const activeIndex = usePlayer((s) => s.activeIndex)
  const status = usePlayer((s) => s.status)
  const engine = usePlayer((s) => s.engine)
  const rate = usePlayer((s) => s.rate)
  const voiceId = usePlayer((s) => s.voiceId)
  const voices = usePlayer((s) => s.voices)
  const toggle = usePlayer((s) => s.toggle)
  const stop = usePlayer((s) => s.stop)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)
  const setRate = usePlayer((s) => s.setRate)
  const setVoice = usePlayer((s) => s.setVoice)
  const setEngine = usePlayer((s) => s.setEngine)
  const exportMp3 = usePlayer((s) => s.exportMp3)
  const exporting = usePlayer((s) => s.exporting)

  const total = doc?.paragraphs.length ?? 0
  const has = total > 0
  const pos = has ? activeIndex + 1 : 0
  const pct = has ? (pos / total) * 100 : 0

  const engineWord = engine === 'system' ? 'voz del sistema' : ENGINE_LABELS[engine]
  const statusLabel =
    status === 'playing'
      ? `Reproduciendo · ${engineWord}`
      : status === 'paused'
        ? 'En pausa'
        : has
          ? 'Listo'
          : 'Sin documento'

  return (
    <div className="transport">
      <div className="transport__buttons">
        <button
          type="button"
          className="tbtn"
          onClick={prev}
          disabled={!has || activeIndex === 0}
          title="Párrafo anterior"
        >
          &#9664;&#9664;
        </button>
        <button
          type="button"
          className="tbtn tbtn--play"
          onClick={toggle}
          disabled={!has}
          title={status === 'playing' ? 'Pausar' : 'Reproducir'}
        >
          {status === 'playing' ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className="tbtn"
          onClick={next}
          disabled={!has || activeIndex >= total - 1}
          title="Párrafo siguiente"
        >
          &#9654;&#9654;
        </button>
        <button
          type="button"
          className="tbtn tbtn--stop"
          onClick={stop}
          disabled={!has || status === 'idle'}
          title="Detener"
        >
          &#9632;
        </button>
      </div>

      <div className="transport__progress">
        <div className="transport__meta">
          <span>{has ? `Párrafo ${pos} de ${total}` : 'Párrafo — de —'}</span>
          <span>{statusLabel}</span>
        </div>
        <div className="transport__track">
          <div className="transport__bar" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="transport__controls">
        <label className="field">
          Motor
          <select value={engine} onChange={(e) => void setEngine(e.target.value as EngineId)}>
            <option value="system">{ENGINE_LABELS.system}</option>
            <option value="elevenlabs">{ENGINE_LABELS.elevenlabs}</option>
            <option value="openai">{ENGINE_LABELS.openai}</option>
          </select>
        </label>

        <label className="field">
          Voz
          <select
            value={voiceId ?? ''}
            onChange={(e) => setVoice(e.target.value)}
            disabled={voices.length === 0}
          >
            {voices.length === 0 && <option value="">Cargando voces…</option>}
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} ({v.lang})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Velocidad {rate.toFixed(1)}×
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
          />
        </label>

        {(engine === 'elevenlabs' || engine === 'openai') && (
          <button
            type="button"
            className="btn btn--ghost"
            style={{ height: 34, alignSelf: 'flex-end' }}
            onClick={() => void exportMp3()}
            disabled={!has || exporting !== null}
            title="Sintetiza y guarda todo el documento como un MP3"
          >
            {exporting ? `Exportando ${exporting.done}/${exporting.total}` : 'Exportar MP3'}
          </button>
        )}
      </div>
    </div>
  )
}
