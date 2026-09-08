/**
 * Normalizador de texto extraído de PDF (brief §5.3). Se aplica por página, en
 * este orden:
 *   1. Unir palabras cortadas por guion al final de línea.
 *   2. Colapsar saltos de línea simples dentro de un párrafo; conservar dobles.
 *   3. Eliminar líneas que se repiten en ≥ N % de las páginas (encabezados/pies).
 *   4. Eliminar líneas que son solo un número (numeración de página).
 *   5. Colapsar espacios múltiples.
 *
 * Cada regla es una función pura con su test (`normalize.test.ts`).
 */

/** Regla 1: `infor-\nmación` → `información` (solo si sigue minúscula). */
export function dehyphenate(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/(\p{L})[-­][ \t]*\n[ \t]*(\p{Ll})/gu, '$1$2')
}

/** Regla 2: salto simple entre líneas → espacio; salto doble → fin de párrafo. */
export function collapseSoftBreaks(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n[ \t\n]*/)
    .map((para) => para.replace(/[ \t]*\n[ \t]*/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

/** Regla 4: `true` si la línea es solo numeración de página. */
export function isPageNumberLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  return (
    /^[-–—•·]?\s*\d{1,4}\s*[-–—•·]?$/.test(t) ||
    /^(?:página|pág\.?|page|p\.)\s*\d{1,4}$/i.test(t) ||
    /^\d{1,4}\s*\/\s*\d{1,4}$/.test(t)
  )
}

/** Regla 5: espacios/tabuladores múltiples → uno; ≥3 saltos → 2. */
export function collapseSpaces(text: string): string {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface BoilerplateOptions {
  /** Fracción de páginas en que debe aparecer una línea para tratarla como
   *  encabezado/pie. Por defecto 0.6 (brief §5.3). */
  threshold?: number
  /** Nº mínimo de páginas para activar la detección (evita falsos positivos). */
  minPages?: number
}

/**
 * Reglas 3 + 4 sobre un documento paginado: quita de cada página las líneas que
 * se repiten en muchas páginas y las de numeración. Devuelve el texto de cada
 * página ya filtrado, manteniendo la correspondencia por índice.
 */
export function stripBoilerplateLines(pages: string[], opts: BoilerplateOptions = {}): string[] {
  const threshold = opts.threshold ?? 0.6
  const minPages = opts.minPages ?? 3

  const linesPerPage = pages.map((p) => p.replace(/\r\n?/g, '\n').split('\n'))

  const repeated = new Set<string>()
  if (pages.length >= minPages) {
    const pageCount = new Map<string, number>()
    for (const lines of linesPerPage) {
      for (const l of new Set(lines.map((x) => x.trim()).filter(Boolean))) {
        pageCount.set(l, (pageCount.get(l) ?? 0) + 1)
      }
    }
    const limit = threshold * pages.length
    for (const [line, count] of pageCount) {
      // Un párrafo largo que casualmente se repite no es un encabezado.
      if (count >= limit && line.length <= 120) repeated.add(line)
    }
  }

  return linesPerPage.map((lines) =>
    lines
      .filter((line) => {
        const t = line.trim()
        if (t && repeated.has(t)) return false // regla 3
        if (isPageNumberLine(line)) return false // regla 4
        return true
      })
      .join('\n')
  )
}

/** Reglas 1, 2 y 5 sobre el texto de una página → sus párrafos ya limpios. */
export function normalizePageText(text: string): string[] {
  const cleaned = collapseSpaces(collapseSoftBreaks(dehyphenate(text)))
  return cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Pipeline completo (brief §5.3) sobre un documento paginado → lista plana de
 * párrafos. Cada elemento lleva el número de página (1-based) del que procede.
 */
export function normalizePages(
  pages: string[],
  opts: BoilerplateOptions = {}
): { text: string; page: number }[] {
  return stripBoilerplateLines(pages, opts).flatMap((pageText, i) =>
    normalizePageText(pageText).map((text) => ({ text, page: i + 1 }))
  )
}
