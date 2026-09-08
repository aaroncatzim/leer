import { describe, expect, it } from 'vitest'
import { segmentIntoChunks } from './segment'

describe('segmentIntoChunks', () => {
  it('agrupa párrafos consecutivos por debajo del límite en un chunk', () => {
    const chunks = segmentIntoChunks(['Uno.', 'Dos.', 'Tres.'], 200)
    expect(chunks).toEqual(['Uno.\n\nDos.\n\nTres.'])
  })

  it('abre un chunk nuevo cuando añadir el párrafo pasaría del límite', () => {
    const a = 'a'.repeat(120)
    const b = 'b'.repeat(120)
    const chunks = segmentIntoChunks([a, b], 200)
    expect(chunks).toEqual([a, b])
  })

  it('corta un párrafo gigante en frontera de frase', () => {
    const para = `${'x'.repeat(150)}. ${'y'.repeat(150)}. ${'z'.repeat(50)}.`
    const chunks = segmentIntoChunks([para], 200)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.length <= 200)).toBe(true)
    expect(chunks[0].endsWith('.')).toBe(true)
  })

  it('si no hay frontera de frase, corta por el último espacio', () => {
    const para = `${'palabra '.repeat(60)}`.trim() // 480 chars, sin puntuación
    const chunks = segmentIntoChunks([para], 200)
    expect(chunks.every((c) => c.length <= 200)).toBe(true)
    expect(chunks.every((c) => !c.endsWith(' ') && !c.startsWith(' '))).toBe(true)
  })

  it('ignora párrafos vacíos', () => {
    expect(segmentIntoChunks(['', '   ', 'Real.'], 200)).toEqual(['Real.'])
  })
})
