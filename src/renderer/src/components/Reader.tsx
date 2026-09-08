import { useEffect, useRef } from 'react'
import type { DocumentSource } from '@shared/document'
import { usePlayer } from '../store'

const SOURCE_LABEL: Record<DocumentSource, string> = {
  text: 'Texto pegado',
  html: 'HTML',
  pdf: 'PDF'
}

/** Parte un texto en [antes, palabra, después] alrededor de un offset. */
function splitAtWord(text: string, charIndex: number): [string, string, string] {
  if (charIndex < 0 || charIndex >= text.length) return [text, '', '']
  let start = charIndex
  while (start > 0 && !/\s/.test(text[start - 1])) start--
  let end = charIndex
  while (end < text.length && !/\s/.test(text[end])) end++
  return [text.slice(0, start), text.slice(start, end), text.slice(end)]
}

export function Reader() {
  const doc = usePlayer((s) => s.doc)
  const activeIndex = usePlayer((s) => s.activeIndex)
  const status = usePlayer((s) => s.status)
  const wordStart = usePlayer((s) => s.wordStart)
  const warningsOpen = usePlayer((s) => s.warningsOpen)
  const ocr = usePlayer((s) => s.ocr)
  const jumpTo = usePlayer((s) => s.jumpTo)
  const dismissWarnings = usePlayer((s) => s.dismissWarnings)
  const cancelOcr = usePlayer((s) => s.cancelOcr)

  const activeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  const hasParagraphs = !!doc && doc.paragraphs.length > 0

  if (!doc || (!hasParagraphs && !ocr)) {
    return (
      <section className="reader">
        <div className="empty">
          <div className="empty__glyph" aria-hidden="true">
            &#9654;
          </div>
          <p>
            Pega texto en el panel de la izquierda y pulsa <strong>Cargar texto</strong>, o abre
            un PDF o una página web para escucharlos con la voz del sistema.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="reader">
      {ocr && (
        <div className="reader__ocr">
          <span className="reader__ocr-spin" aria-hidden="true" />
          <span className="reader__ocr-label">
            OCR · página {ocr.done} de {ocr.total}
          </span>
          <div className="reader__ocr-track">
            <div
              className="reader__ocr-bar"
              style={{ width: `${ocr.total ? (ocr.done / ocr.total) * 100 : 0}%` }}
            />
          </div>
          <span className="reader__ocr-hint">Ya puedes escuchar lo procesado</span>
          <button type="button" onClick={cancelOcr}>
            Cancelar
          </button>
        </div>
      )}

      {warningsOpen && doc.warnings.length > 0 && (
        <div className="reader__warn">
          <span className="reader__warn-mark" aria-hidden="true">
            !
          </span>
          <p>{doc.warnings.join(' ')}</p>
          <button type="button" onClick={dismissWarnings}>
            Ocultar
          </button>
        </div>
      )}

      <div className="reader__head">
        <h1 className="reader__title">{doc.title}</h1>
        <span className="reader__meta">
          {SOURCE_LABEL[doc.source]} · {doc.paragraphs.length}{' '}
          {doc.paragraphs.length === 1 ? 'párrafo' : 'párrafos'}
        </span>
      </div>

      <div className="reader__list">
        {doc.paragraphs.map((p, i) => {
          const active = i === activeIndex
          const showWord = active && status === 'playing' && wordStart >= 0
          const [before, word, after] = showWord
            ? splitAtWord(p.text, wordStart)
            : [p.text, '', '']
          return (
            <div
              key={p.id}
              ref={active ? activeRef : null}
              className={`para${active ? ' para--active' : ''}`}
              onClick={() => jumpTo(i)}
            >
              <span className="para__num">{String(i + 1).padStart(2, '0')}</span>
              <p className="para__text">
                {word ? (
                  <>
                    {before}
                    <mark>{word}</mark>
                    {after}
                  </>
                ) : (
                  p.text
                )}
              </p>
              {(p.page !== undefined || p.origin === 'ocr') && (
                <span className="para__page">
                  {p.origin === 'ocr' ? 'OCR ' : ''}
                  {p.page !== undefined ? `p. ${p.page}` : ''}
                </span>
              )}
            </div>
          )
        })}
        {hasParagraphs || !ocr ? null : (
          <p className="reader__ocr-wait">Reconociendo el texto de las páginas escaneadas…</p>
        )}
      </div>
    </section>
  )
}
