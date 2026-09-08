/**
 * Extractor de HTML (brief §4 `extract:html`, §5.2). Se ejecuta en el proceso
 * principal: descarga la URL aquí (nunca en el renderer), pasa el HTML por
 * jsdom + Readability y, si Readability no puede aislar el artículo, cae al
 * texto completo del `<body>` con un aviso.
 *
 * jsdom expone la API del DOM pero el proyecto `main` no incluye `lib.dom`, así
 * que se accede a través de la interfaz mínima `DomNode` / `DomDocument`. Es la
 * única frontera sin comprobar de tipos de este archivo.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { buildDocument, splitParagraphs, type LectorDocument } from '../../shared/document'
import type { HtmlSource } from '../../shared/ipc'

interface DomNode {
  textContent: string | null
  querySelector(selectors: string): DomNode | null
  querySelectorAll(selectors: string): Iterable<DomNode>
  remove(): void
}
interface DomDocument {
  body: DomNode | null
  querySelectorAll(selectors: string): Iterable<DomNode>
}

const NOISE_SELECTOR = 'script, style, noscript, template, iframe, nav, footer, header, aside, form'
const BLOCK_SELECTOR = 'p, li, dd, blockquote, pre, h1, h2, h3, h4, h5, h6, figcaption'
const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = 8 * 1024 * 1024

function docOf(html: string): DomDocument {
  return new JSDOM(html).window.document as unknown as DomDocument
}

function stripNoise(doc: DomDocument): void {
  for (const el of doc.querySelectorAll(NOISE_SELECTOR)) el.remove()
}

function blocksToText(root: DomNode | null): string[] {
  if (!root) return []
  const out: string[] = []
  for (const el of root.querySelectorAll(BLOCK_SELECTOR)) {
    // Si el bloque contiene otro bloque, sus hijos ya se recogen: no duplicar.
    if (el.querySelector(BLOCK_SELECTOR)) continue
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text.length > 1) out.push(text)
  }
  return out
}

function titleOf(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? m[1].replace(/\s+/g, ' ').trim() : ''
}

/**
 * HTML (cadena) → párrafos legibles. Determinista; toda la lógica de extracción
 * vive aquí para poder testearla sin red ni disco.
 */
export function htmlToParagraphs(html: string): { paragraphs: string[]; usedReadability: boolean } {
  // Readability muta el documento que recibe, así que necesita su propia copia.
  const readerDoc = docOf(html)
  stripNoise(readerDoc)
  const article = new Readability(readerDoc as never).parse()
  if (article?.content) {
    const paragraphs = blocksToText(docOf(`<body>${article.content}</body>`).body)
    if (paragraphs.length > 0) return { paragraphs, usedReadability: true }
  }

  // Fallback (brief §5.2): texto completo del cuerpo.
  const doc = docOf(html)
  stripNoise(doc)
  const bodyBlocks = blocksToText(doc.body)
  if (bodyBlocks.length > 0) return { paragraphs: bodyBlocks, usedReadability: false }
  return { paragraphs: splitParagraphs(doc.body?.textContent ?? ''), usedReadability: false }
}

async function loadHtml(source: HtmlSource): Promise<{ html: string; label: string }> {
  if (source.kind === 'html') return { html: source.html, label: source.label ?? 'HTML' }
  if (source.kind === 'file') return { html: await readFile(source.path, 'utf8'), label: basename(source.path) }

  let url: URL
  try {
    url = new URL(source.url)
  } catch {
    throw new Error('La URL no es válida.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Solo se admiten direcciones http(s).')
  }

  let res: Response
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': 'LectorAudio/0.1 (+https://github.com/aaroncatzim/leer)',
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9'
      }
    })
  } catch (err) {
    const e = err as Error
    throw new Error(
      e.name === 'TimeoutError' ? 'La descarga tardó demasiado.' : `No se pudo descargar: ${e.message}`
    )
  }

  if (!res.ok) throw new Error(`La descarga falló (HTTP ${res.status}).`)
  const ctype = res.headers.get('content-type') ?? ''
  if (ctype && !/text\/(html|plain)|application\/xhtml/i.test(ctype)) {
    throw new Error(`El recurso no es HTML (${ctype.split(';')[0].trim()}).`)
  }
  const bytes = await res.arrayBuffer()
  if (bytes.byteLength > MAX_BYTES) throw new Error('El documento es demasiado grande.')
  return { html: new TextDecoder('utf-8').decode(bytes), label: url.hostname.replace(/^www\./, '') }
}

export async function extractHtml(source: HtmlSource): Promise<LectorDocument> {
  const { html, label } = await loadHtml(source)
  const { paragraphs, usedReadability } = htmlToParagraphs(html)
  if (paragraphs.length === 0) throw new Error('No se encontró texto legible en el HTML.')

  return buildDocument({
    source: 'html',
    title: titleOf(html) || label,
    paragraphs,
    warnings: usedReadability
      ? []
      : [
          'No se pudo aislar el artículo; se leyó el texto completo de la página y ' +
            'puede incluir menús u otros elementos.'
        ]
  })
}
