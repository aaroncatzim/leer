/**
 * Modelo central (brief §5.1). En este hito solo `source: 'text'`; los
 * extractores de PDF y HTML llegan en pasos posteriores y devolverán este
 * mismo tipo.
 */

export interface Paragraph {
  id: string
  text: string
  page?: number
}

export interface LectorDocument {
  /** Identificador estable derivado del texto normalizado. */
  id: string
  source: 'text' | 'pdf' | 'html'
  title: string
  paragraphs: Paragraph[]
  /** Avisos a mostrar en banner (OCR aplicado, Readability falló, etc.). */
  warnings: string[]
}

/**
 * Divide texto pegado en párrafos (brief §5.2): por líneas en blanco dobles;
 * si no hay ninguna, por saltos de línea simples. Colapsa espacios internos y
 * descarta líneas vacías. Función pura y determinista.
 */
export function splitParagraphs(raw: string): string[] {
  const text = raw.replace(/\r\n?/g, '\n').trim()
  if (!text) return []
  const byBlankLine = text.split(/\n[ \t]*\n+/)
  const parts = byBlankLine.length > 1 ? byBlankLine : text.split(/\n+/)
  return parts.map((p) => p.replace(/[ \t]+/g, ' ').replace(/ *\n */g, ' ').trim()).filter(Boolean)
}

/**
 * Hash corto y estable (FNV-1a) para identificar documento y párrafos. El
 * brief pide sha256 para la CLAVE DE CACHÉ del audio remoto (§5.6); eso se
 * calculará en el proceso principal cuando exista el motor remoto. Aquí solo
 * necesitamos un id local reproducible.
 */
function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function deriveTitle(paragraphs: string[]): string {
  const first = paragraphs[0] ?? ''
  if (!first) return 'Documento sin título'
  const head = first.split(' ').slice(0, 9).join(' ')
  return head.length < first.length ? head + '…' : head
}

export function buildTextDocument(raw: string): LectorDocument {
  const parts = splitParagraphs(raw)
  const id = fnv1a(parts.join('\n\n'))
  return {
    id,
    source: 'text',
    title: deriveTitle(parts),
    paragraphs: parts.map((text, i) => ({ id: `${id}-${i}`, text })),
    warnings: []
  }
}
