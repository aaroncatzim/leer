/**
 * Extractor de PDF sin OCR (brief §4 `extract:pdf`, §5.2, §8 paso 4). Se ejecuta
 * en el proceso principal: lee los bytes, saca el texto página a página con
 * `pdfjs-dist` (`getTextContent`), lo pasa por el normalizador (§5.3) y marca
 * las páginas sin capa de texto para el futuro OCR (paso 5).
 *
 * `pdfjs-dist` 6 solo publica ESM, así que se carga con `import()` dinámico
 * desde este bundle CJS.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { buildDocument, formatPageRanges, type LectorDocument } from '../../shared/document'
import { normalizePages } from '../../shared/normalize'
import type { PdfSource } from '../../shared/ipc'

/** Menos caracteres alfabéticos que esto en una página ⇒ candidata a OCR. */
const MIN_ALPHA_PER_PAGE = 50

interface PdfTextItem {
  str: string
  hasEOL: boolean
  transform: number[]
  height: number
}

let pdfjs: Promise<typeof import('pdfjs-dist')> | null = null
/** Carga perezosa de pdfjs (ESM). Compartida con el módulo de OCR. */
export function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<typeof import('pdfjs-dist')>
  return pdfjs
}

/** Resuelve un `PdfSource` a sus bytes. Compartido con el módulo de OCR. */
export async function loadPdfBytes(source: PdfSource): Promise<{ data: Uint8Array; label: string }> {
  if (source.kind === 'file') {
    return { data: new Uint8Array(await readFile(source.path)), label: basename(source.path) }
  }
  return { data: new Uint8Array(source.bytes), label: source.label ?? 'PDF' }
}

/** Reconstruye el texto de una página a partir de los ítems de pdfjs. */
function itemsToText(items: readonly unknown[]): string {
  let out = ''
  let prevY: number | null = null
  let prevH = 12
  for (const raw of items) {
    const it = raw as Partial<PdfTextItem>
    if (typeof it.str !== 'string') continue // ítem de marked-content
    const y: number = it.transform?.[5] ?? prevY ?? 0
    const h: number = it.height || Math.abs(it.transform?.[3] ?? 0) || prevH

    if (prevY !== null) {
      const dy = prevY - y
      if (dy > h * 1.6) out += '\n\n' // hueco vertical grande → párrafo
      else if (dy > h * 0.4 && !out.endsWith('\n')) out += '\n' // línea nueva
      else if (!out.endsWith('\n') && it.str && !/\s$/.test(out) && !/^\s/.test(it.str)) out += ' '
    }
    out += it.str
    if (it.hasEOL) out += '\n'
    prevY = y
    prevH = h
  }
  return out
}

export async function extractPdf(source: PdfSource): Promise<LectorDocument> {
  const { data, label } = await loadPdfBytes(source)
  const { getDocument } = await getPdfjs()

  // `getTextContent()` no necesita datos de fuentes (usa el ToUnicode del PDF);
  // en Node el `fetch` de `standardFontDataUrl` sobre `file://` falla, así que
  // no se pasa y se baja la verbosidad para no ensuciar la consola.
  const loadingTask = getDocument({ data, verbosity: 0 })

  let pdf: Awaited<typeof loadingTask.promise>
  try {
    pdf = await loadingTask.promise
  } catch (err) {
    await loadingTask.destroy()
    throw new Error(`No se pudo abrir el PDF: ${(err as Error).message}`)
  }

  try {
    const metadata = await pdf.getMetadata().catch(() => null)
    const pdfTitle =
      typeof metadata?.info === 'object' && metadata.info !== null && 'Title' in metadata.info
        ? String((metadata.info as { Title?: unknown }).Title ?? '').trim()
        : ''

    const rawPages: string[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      rawPages.push(itemsToText(content.items))
      page.cleanup()
    }

    const lowTextPages = rawPages
      .map((text, i) => ({ page: i + 1, alpha: (text.match(/\p{L}/gu) ?? []).length }))
      .filter((p) => p.alpha < MIN_ALPHA_PER_PAGE)
      .map((p) => p.page)

    const paragraphs = normalizePages(rawPages)

    if (paragraphs.length === 0 && lowTextPages.length === 0) {
      throw new Error('El PDF no contiene texto extraíble.')
    }

    const warnings: string[] = []
    if (lowTextPages.length > 0) {
      const noun = lowTextPages.length === 1 ? 'la página' : 'las páginas'
      warnings.push(
        `Sin capa de texto en ${noun} ${formatPageRanges(lowTextPages)}; ` +
          'aplicando OCR (el resultado puede contener errores).'
      )
    }

    const doc = buildDocument({
      source: 'pdf',
      title: pdfTitle || label.replace(/\.pdf$/i, ''),
      paragraphs,
      warnings
    })
    if (lowTextPages.length > 0) doc.ocrPending = lowTextPages
    return doc
  } finally {
    await loadingTask.destroy()
  }
}
