/**
 * Modelo central (brief §5.1), compartido por el proceso principal (extractores)
 * y el renderer (reproductor). Sin dependencias de Node ni del DOM.
 */

export type DocumentSource = 'text' | 'pdf' | 'html'

export interface Paragraph {
  id: string
  text: string
  page?: number
  /** `'ocr'` si el texto proviene de OCR (puede contener errores). */
  origin?: 'ocr'
}

export interface LectorDocument {
  /** Identificador estable derivado del texto normalizado. */
  id: string
  source: DocumentSource
  title: string
  paragraphs: Paragraph[]
  /** Avisos a mostrar en banner (OCR aplicado, Readability falló, etc.). */
  warnings: string[]
  /** Páginas del PDF sin capa de texto, pendientes de OCR (brief §5.2). */
  ocrPending?: number[]
}

/**
 * Inserta los párrafos de una página recién OCR-izada en el sitio correcto
 * (ordenado por número de página). Devuelve la lista nueva y dónde se insertó,
 * para que el reproductor ajuste su índice activo. Función pura.
 */
export function insertPageParagraphs(
  paragraphs: Paragraph[],
  page: number,
  texts: string[],
  docId: string
): { paragraphs: Paragraph[]; insertAt: number; count: number } {
  const added: Paragraph[] = texts
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `${docId}-ocr${page}-${i}`, text, page, origin: 'ocr' as const }))

  let insertAt = paragraphs.findIndex((p) => (p.page ?? 0) > page)
  if (insertAt < 0) insertAt = paragraphs.length

  return {
    paragraphs: [...paragraphs.slice(0, insertAt), ...added, ...paragraphs.slice(insertAt)],
    insertAt,
    count: added.length
  }
}

/**
 * Divide texto plano en párrafos (brief §5.2, rama de texto): por líneas en
 * blanco dobles; si no hay ninguna, por saltos de línea simples. Colapsa
 * espacios internos y descarta líneas vacías. Función pura y determinista.
 */
export function splitParagraphs(raw: string): string[] {
  const text = raw.replace(/\r\n?/g, '\n').trim()
  if (!text) return []
  const byBlankLine = text.split(/\n[ \t]*\n+/)
  const parts = byBlankLine.length > 1 ? byBlankLine : text.split(/\n+/)
  return parts.map((p) => p.replace(/[ \t]+/g, ' ').replace(/ *\n */g, ' ').trim()).filter(Boolean)
}

/**
 * Hash corto y estable (FNV-1a). El brief pide sha256 para la CLAVE DE CACHÉ
 * del audio remoto (§5.6); eso se calculará aparte cuando exista el motor
 * remoto. Aquí solo hace falta un id local reproducible.
 */
function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** `[3,4,5,9]` → `"3–5, 9"`. Para avisos de páginas. */
export function formatPageRanges(nums: number[]): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  if (sorted.length === 0) return ''
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i]
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`)
    start = prev = sorted[i]
  }
  return parts.join(', ')
}

export function deriveTitle(paragraphs: string[]): string {
  const first = paragraphs[0] ?? ''
  if (!first) return 'Documento sin título'
  const head = first.split(' ').slice(0, 9).join(' ')
  return head.length < first.length ? head + '…' : head
}

/** Un párrafo de entrada: texto suelto o texto con número de página (PDF). */
export type ParagraphInput = string | { text: string; page?: number }

/** Construye un `LectorDocument` a partir de una lista de párrafos ya limpios. */
export function buildDocument(opts: {
  source: DocumentSource
  paragraphs: ParagraphInput[]
  title?: string
  warnings?: string[]
}): LectorDocument {
  const parts = opts.paragraphs
    .map((p) => (typeof p === 'string' ? { text: p.trim() } : { text: p.text.trim(), page: p.page }))
    .filter((p) => p.text.length > 0)
  const id = fnv1a(parts.map((p) => p.text).join('\n\n'))
  return {
    id,
    source: opts.source,
    title: opts.title?.trim() || deriveTitle(parts.map((p) => p.text)),
    paragraphs: parts.map((p, i) => ({
      id: `${id}-${i}`,
      text: p.text,
      ...(p.page !== undefined ? { page: p.page } : {})
    })),
    warnings: opts.warnings ?? []
  }
}

/** Atajo para la entrada de texto pegado. */
export function buildTextDocument(raw: string): LectorDocument {
  return buildDocument({ source: 'text', paragraphs: splitParagraphs(raw) })
}
