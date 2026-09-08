/**
 * Segmentador para el motor remoto (brief §5.4): agrupa párrafos consecutivos
 * en chunks de como máximo `maxChars` caracteres. Nunca parte a mitad de frase;
 * si un párrafo por sí solo supera el límite, se corta en `. ! ? ;` y, en
 * último caso, por el último espacio.
 *
 * El reproductor sintetiza párrafo a párrafo (para resaltar por párrafo), pero
 * esta agrupación se usa al exportar MP3 y queda lista por si el motor remoto
 * pasa a chunked.
 */
export function segmentIntoChunks(paragraphs: string[], maxChars = 3000): string[] {
  const limit = Math.max(200, maxChars)
  const chunks: string[] = []
  let current = ''

  const flush = (): void => {
    if (current.trim()) chunks.push(current.trim())
    current = ''
  }

  for (const raw of paragraphs) {
    const para = raw.trim()
    if (!para) continue

    if (para.length > limit) {
      flush()
      for (const piece of splitLongParagraph(para, limit)) chunks.push(piece)
      continue
    }
    if (current && current.length + 2 + para.length > limit) flush()
    current = current ? `${current}\n\n${para}` : para
  }
  flush()
  return chunks
}

function splitLongParagraph(text: string, limit: number): string[] {
  const out: string[] = []
  let rest = text.trim()

  while (rest.length > limit) {
    let cut = -1
    const boundary = /[.!?;](?=\s|$)/g
    let m: RegExpExecArray | null
    while ((m = boundary.exec(rest)) !== null) {
      if (m.index + 1 > limit) break
      cut = m.index + 1
    }
    if (cut <= 0) {
      cut = rest.lastIndexOf(' ', limit)
      if (cut <= 0) cut = limit
    }
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}
