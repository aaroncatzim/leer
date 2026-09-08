import { create } from 'zustand'
import {
  buildTextDocument,
  formatPageRanges,
  insertPageParagraphs,
  type LectorDocument
} from '@shared/document'
import type { HtmlSource, PdfSource } from '@shared/ipc'
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

export interface OcrState {
  id: string
  total: number
  done: number
}

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
  /** Extracción en curso (descarga / parseo de HTML o PDF). */
  busy: boolean
  /** Último error de carga (URL inválida, descarga fallida, etc.). */
  loadError: string | null
  /** OCR en curso sobre el PDF actual, o `null`. */
  ocr: OcrState | null
  /** Último PDF cargado, para poder relanzar el OCR de sus páginas. */
  lastPdfSource: PdfSource | null

  initVoices: () => Promise<void>
  loadText: (raw: string) => void
  loadHtml: (source: HtmlSource) => Promise<void>
  loadPdf: (source: PdfSource) => Promise<void>
  cancelOcr: () => void
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
    if (!get().doc || get().doc!.paragraphs.length === 0) return
    set({ status: 'playing' })

    // Se relee `doc` en cada vuelta para incorporar párrafos que el OCR vaya
    // insertando mientras se lee.
    for (let i = startIndex; ; i++) {
      const doc = get().doc
      if (gen !== generation || !doc || i >= doc.paragraphs.length) break
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
    if (gen === generation) set({ status: 'idle', activeIndex: 0, wordStart: -1 })
  }

  provider.onBoundary((charIndex) => {
    if (get().status === 'playing') set({ wordStart: charIndex })
  })

  function stopOcr(): void {
    const { ocr } = get()
    if (ocr) void window.api.cancelOcr(ocr.id)
    set({ ocr: null })
  }

  async function runExtract(extract: () => Promise<LectorDocument>): Promise<void> {
    if (get().busy) return
    generation++
    provider.stop()
    stopOcr()
    set({ busy: true, loadError: null, lastPdfSource: null })
    try {
      const doc = await extract()
      set({ doc, activeIndex: 0, status: 'idle', wordStart: -1, warningsOpen: true })
    } catch (err) {
      set({ loadError: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ busy: false })
    }
  }

  async function beginOcr(source: PdfSource, pages: number[]): Promise<void> {
    try {
      const id = await window.api.startOcr(source, pages)
      set({ ocr: { id, total: pages.length, done: 0 } })
    } catch (err) {
      set({ loadError: `OCR: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  // ── Eventos de OCR (main → renderer) ──────────────────────────────
  window.api.on('ocr:progress', ({ ocrId, total, done }) => {
    const { ocr } = get()
    if (ocr?.id === ocrId) set({ ocr: { ...ocr, total, done } })
  })

  window.api.on('ocr:page', ({ ocrId, page, paragraphs }) => {
    const s = get()
    if (s.ocr?.id !== ocrId || !s.doc) return
    const { paragraphs: merged, insertAt, count } = insertPageParagraphs(
      s.doc.paragraphs,
      page,
      paragraphs,
      s.doc.id
    )
    set({
      doc: {
        ...s.doc,
        paragraphs: merged,
        ocrPending: (s.doc.ocrPending ?? []).filter((p) => p !== page)
      },
      activeIndex: s.activeIndex >= insertAt ? s.activeIndex + count : s.activeIndex
    })
  })

  window.api.on('ocr:done', ({ ocrId, error }) => {
    const s = get()
    if (s.ocr?.id !== ocrId) return
    set({ ocr: null })
    if (error) {
      set({ loadError: `OCR: ${error}` })
      return
    }
    if (s.doc && s.doc.source === 'pdf') {
      const ocrPages = s.doc.paragraphs
        .filter((p) => p.origin === 'ocr' && p.page !== undefined)
        .map((p) => p.page as number)
      const warnings = s.doc.warnings.filter((w) => !w.includes('aplicando OCR'))
      if (ocrPages.length > 0) {
        warnings.push(
          `Páginas ${formatPageRanges(ocrPages)} procesadas con OCR; el texto puede contener errores.`
        )
      }
      set({ doc: { ...s.doc, warnings, ocrPending: [] } })
    }
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
    ocr: null,
    lastPdfSource: null,

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
      stopOcr()
      set({
        doc: buildTextDocument(raw),
        activeIndex: 0,
        status: 'idle',
        wordStart: -1,
        warningsOpen: true,
        loadError: null,
        lastPdfSource: null
      })
    },

    loadHtml: (source) => runExtract(() => window.api.extractHtml(source)),

    async loadPdf(source) {
      await runExtract(() => window.api.extractPdf(source))
      const doc = get().doc
      if (doc?.source === 'pdf' && doc.ocrPending && doc.ocrPending.length > 0) {
        set({ lastPdfSource: source })
        void beginOcr(source, doc.ocrPending)
      }
    },

    cancelOcr: stopOcr,

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
