import { describe, expect, it } from 'vitest'
import { buildDocument, buildTextDocument, splitParagraphs } from './document'

describe('splitParagraphs', () => {
  it('divide por líneas en blanco dobles', () => {
    expect(splitParagraphs('Uno.\n\nDos.\n\nTres.')).toEqual(['Uno.', 'Dos.', 'Tres.'])
  })

  it('cae a saltos simples cuando no hay líneas en blanco', () => {
    expect(splitParagraphs('Uno.\nDos.\nTres.')).toEqual(['Uno.', 'Dos.', 'Tres.'])
  })

  it('une saltos simples dentro de un párrafo y conserva los dobles', () => {
    expect(splitParagraphs('Primera\nlínea partida.\n\nSegundo párrafo.')).toEqual([
      'Primera línea partida.',
      'Segundo párrafo.'
    ])
  })

  it('colapsa espacios y tabulaciones múltiples', () => {
    expect(splitParagraphs('Con   varios\t\tespacios.')).toEqual(['Con varios espacios.'])
  })

  it('normaliza CRLF y recorta extremos', () => {
    expect(splitParagraphs('\r\n  Hola.\r\n\r\n  Adiós.  \r\n')).toEqual(['Hola.', 'Adiós.'])
  })

  it('descarta líneas en blanco de sobra y devuelve [] para entrada vacía', () => {
    expect(splitParagraphs('\n\n\n   \n\n')).toEqual([])
    expect(splitParagraphs('')).toEqual([])
  })
})

describe('buildTextDocument', () => {
  it('produce un párrafo por bloque con id derivado del documento', () => {
    const doc = buildTextDocument('Alfa.\n\nBeta.')
    expect(doc.source).toBe('text')
    expect(doc.paragraphs.map((p) => p.text)).toEqual(['Alfa.', 'Beta.'])
    expect(doc.paragraphs[0].id).toBe(`${doc.id}-0`)
    expect(doc.warnings).toEqual([])
  })

  it('el id es estable para el mismo texto normalizado', () => {
    expect(buildTextDocument('Hola.\n\nMundo.').id).toBe(
      buildTextDocument('  Hola.\n\n\n  Mundo.  ').id
    )
  })

  it('deriva un título de las primeras palabras', () => {
    const doc = buildTextDocument(
      'La fotosíntesis es el proceso por el que las plantas transforman la luz en energía.'
    )
    expect(doc.title).toBe('La fotosíntesis es el proceso por el que las…')
  })
})

describe('buildDocument', () => {
  it('limpia párrafos vacíos, respeta título y avisos', () => {
    const doc = buildDocument({
      source: 'html',
      title: '  Un artículo  ',
      paragraphs: ['  Primero.  ', '', '   ', 'Segundo.'],
      warnings: ['Readability falló.']
    })
    expect(doc.source).toBe('html')
    expect(doc.title).toBe('Un artículo')
    expect(doc.paragraphs.map((p) => p.text)).toEqual(['Primero.', 'Segundo.'])
    expect(doc.warnings).toEqual(['Readability falló.'])
  })

  it('deriva título cuando no se pasa uno', () => {
    expect(buildDocument({ source: 'html', paragraphs: ['Titular corto.'] }).title).toBe(
      'Titular corto.'
    )
  })
})
