/**
 * OCR de páginas de PDF escaneadas (brief §5.2, §8 paso 5). Rasteriza cada
 * página con pdfjs + `@napi-rs/canvas` (~200 DPI) y la reconoce con
 * `tesseract.js` (idioma `spa`, datos empaquetados en `resources/tessdata`, sin
 * red). El reconocimiento corre en el worker propio de tesseract.js; el bucle
 * cede el hilo entre páginas para no bloquear el proceso principal. Cancelable.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { app } from 'electron'
import { createWorker, type Worker as TesseractWorker } from 'tesseract.js'
import { normalizePageText } from '../../shared/normalize'
import { getPdfjs } from '../extract/pdf'

/** 200 DPI sobre el tamaño natural del PDF (72 DPI). */
const RENDER_SCALE = 200 / 72

export interface OcrProgress {
  page: number
  total: number
  done: number
}

export interface OcrPage {
  page: number
  paragraphs: string[]
}

export interface OcrRunOptions {
  data: Uint8Array
  /** Números de página (1-based) a reconocer. */
  pages: number[]
  lang?: string
  onProgress: (p: OcrProgress) => void
  onPage: (r: OcrPage) => void
  /** Bandera de cancelación; se consulta entre etapas. */
  signal: { cancelled: boolean }
  /** Registra el worker para poder terminarlo desde fuera al cancelar. */
  registerWorker?: (w: TesseractWorker) => void
}

/**
 * Localiza `resources/tessdata` (los `.traineddata` van empaquetados, sin red).
 * Se prueban varias rutas porque `app.getAppPath()` / `process.resourcesPath`
 * varían entre dev, `electron .` y build empaquetado.
 */
function tessdataDir(): string {
  const candidates = [
    join(process.resourcesPath, 'resources', 'tessdata'),
    join(app.getAppPath(), 'resources', 'tessdata'),
    join(__dirname, '..', '..', 'resources', 'tessdata')
  ]
  return candidates.find((dir) => existsSync(join(dir, 'spa.traineddata'))) ?? candidates[1]
}

const yieldToLoop = (): Promise<void> => new Promise((r) => setImmediate(r))

export async function ocrPdfPages(opts: OcrRunOptions): Promise<void> {
  const { data, pages, signal, onProgress, onPage, registerWorker } = opts
  if (pages.length === 0) return

  const lang = opts.lang ?? 'spa'
  const langPath = tessdataDir()
  // Sin este archivo tesseract.js intentaría descargarlo de la red y colgarse;
  // mejor fallar con un mensaje claro.
  if (!existsSync(join(langPath, `${lang}.traineddata`))) {
    throw new Error(`No se encontró el idioma de OCR (${lang}.traineddata).`)
  }

  const { getDocument } = await getPdfjs()
  const loadingTask = getDocument({ data, verbosity: 0 })
  const pdf = await loadingTask.promise

  const worker = await createWorker(lang, 1, {
    langPath,
    cachePath: join(app.getPath('userData'), 'tessdata-cache'),
    gzip: false
  })
  registerWorker?.(worker)

  try {
    let done = 0
    for (const pageNum of pages) {
      if (signal.cancelled) break

      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({
        canvasContext: ctx as never,
        canvas: canvas as never,
        viewport
      }).promise
      page.cleanup()
      if (signal.cancelled) break

      const png = canvas.toBuffer('image/png')
      const { data: recognized } = await worker.recognize(png)
      if (signal.cancelled) break

      onPage({ page: pageNum, paragraphs: normalizePageText(recognized.text) })
      done += 1
      onProgress({ page: pageNum, total: pages.length, done })
      await yieldToLoop()
    }
  } finally {
    await worker.terminate().catch(() => undefined)
    await loadingTask.destroy().catch(() => undefined)
  }
}
