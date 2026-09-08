import { create } from 'zustand'
import { buildTextDocument, type LectorDocument } from '@shared/document'
import type { HtmlSource } from '@shared/ipc'
import { SystemTtsProvider, type Voice } from './lib/tts'

/**
 * Estado del reproductor. El proveedor TTS es un singleton de módulo y el bucle
 * de reproducción avanza párrafo a párrafo (brief §5.4: el motor local recibe
 * un párrafo cada vez). `generation` invalida bucles obsoletos cuando el
 * usuario salta, para, cambia de velocidad, etc.
 */

const provider = new SystemTtsProvider()

export type EngineId = 'system' | 'elevenlabs' | 'openai'
export type Status = 'idle' | 'playing' | 'paused'

interface PlayerState {
  doc: LectorDocument | null
  activeIndex: number
  status: Status
  engine: EngineId
  rate: number
  voiceId: string | null
  voices: Voice[]
  /** Offset de la palabra en curso dentro del párrafo activo; -1 = sin dato. */
  wordStart: number
  warningsOpen: boolean
  /** Contador de sesión para la futura factura de la API (brief §5.6). */
  apiChars: number
  /** Extracción en curso (descarga / parseo de HTML). */
  busy: boolean
  /** Último error de carga (URL inválida, descarga fallida, etc.). */
  loadError: string | null

  initVoices: () => Promise<void>
  loadText: (raw: string) => void
  loadHtml: (source: HtmlSource) => Promise<void>
  clearError: () => void
  toggle: () => void
  stop: () => void
  next: () => void
  prev: () => void
  jumpTo: (index: number) => void
  setRate: (rate: number) => void
  setVoice: (id: string) => void
  dismissWarnings: () => void
}

let generation = 0

export const usePlayer = create<PlayerState>((set, get) => {
  async function runFrom(startIndex: number): Promise<void> {
    const gen = ++generation
    const doc = get().doc
    if (!doc || doc.paragraphs.length === 0) return
    set({ status: 'playing' })

    for (let i = startIndex; i < doc.paragraphs.length; i++) {
      if (gen !== generation) return
      set({ activeIndex: i, wordStart: -1 })
      try {
        await provider.speak(doc.paragraphs[i].text, { voiceId: get().voiceId, rate: get().rate })
      } catch (err) {
        console.error('[tts]', err)
        if (gen === generation) set({ status: 'idle', wordStart: -1 })
        return
      }
      if (gen !== generation) return
    }
    // Fin del documento: volver al principio, en pausa.
    if (gen === generation) set({ status: 'idle', activeIndex: 0, wordStart: -1 })
  }

  provider.onBoundary((charIndex) => {
    if (get().status === 'playing') set({ wordStart: charIndex })
  })

  return {
    doc: null,
    activeIndex: 0,
    status: 'idle',
    engine: 'system',
    rate: 1,
    voiceId: null,
    voices: [],
    wordStart: -1,
    warningsOpen: true,
    apiChars: 0,
    busy: false,
    loadError: null,

    async initVoices() {
      const voices = await provider.listVoices()
      set((s) => ({
        voices,
        voiceId:
          s.voiceId ??
          voices.find((v) => v.lang.toLowerCase().startsWith('es'))?.id ??
          voices[0]?.id ??
          null
      }))
    },

    loadText(raw) {
      generation++
      provider.stop()
      set({
        doc: buildTextDocument(raw),
        activeIndex: 0,
        status: 'idle',
        wordStart: -1,
        warningsOpen: true,
        loadError: null
      })
    },

    async loadHtml(source) {
      if (get().busy) return
      generation++
      provider.stop()
      set({ busy: true, loadError: null })
      try {
        const doc = await window.api.extractHtml(source)
        set({ doc, activeIndex: 0, status: 'idle', wordStart: -1, warningsOpen: true })
      } catch (err) {
        set({ loadError: err instanceof Error ? err.message : String(err) })
      } finally {
        set({ busy: false })
      }
    },

    clearError() {
      set({ loadError: null })
    },

    toggle() {
      const { status, doc, activeIndex } = get()
      if (!doc || doc.paragraphs.length === 0) return
      if (status === 'playing') {
        provider.pause()
        set({ status: 'paused' })
      } else if (status === 'paused') {
        provider.resume()
        set({ status: 'playing' })
      } else {
        void runFrom(activeIndex)
      }
    },

    stop() {
      generation++
      provider.stop()
      set({ status: 'idle', activeIndex: 0, wordStart: -1 })
    },

    next() {
      const { doc, activeIndex, status } = get()
      if (!doc) return
      const target = Math.min(doc.paragraphs.length - 1, activeIndex + 1)
      if (status === 'idle') set({ activeIndex: target, wordStart: -1 })
      else void runFrom(target)
    },

    prev() {
      const { doc, activeIndex, status } = get()
      if (!doc) return
      const target = Math.max(0, activeIndex - 1)
      if (status === 'idle') set({ activeIndex: target, wordStart: -1 })
      else void runFrom(target)
    },

    jumpTo(index) {
      const { doc, status } = get()
      if (!doc) return
      const target = Math.max(0, Math.min(doc.paragraphs.length - 1, index))
      if (status === 'playing') {
        void runFrom(target)
      } else {
        generation++
        provider.stop()
        set({ activeIndex: target, status: 'idle', wordStart: -1 })
      }
    },

    setRate(rate) {
      set({ rate })
      // Cambiar de velocidad a mitad de lectura reinicia el párrafo actual.
      if (get().status === 'playing') void runFrom(get().activeIndex)
    },

    setVoice(id) {
      set({ voiceId: id })
      if (get().status === 'playing') void runFrom(get().activeIndex)
    },

    dismissWarnings() {
      set({ warningsOpen: false })
    }
  }
})
