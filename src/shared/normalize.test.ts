import { describe, expect, it } from 'vitest'
import {
  collapseSoftBreaks,
  collapseSpaces,
  dehyphenate,
  isPageNumberLine,
  normalizePages,
  stripBoilerplateLines
} from './normalize'

// Un caso entrada/salida por regla (brief §5.3).

describe('regla 1 · dehyphenate', () => {
  it('une la palabra cortada por guion al final de línea', () => {
    expect(dehyphenate('conviene infor-\nmación clara')).toBe('conviene información clara')
  })
  it('no une si tras el guion viene mayúscula (no es continuación)', () => {
    expect(dehyphenate('el sur-\nNorte')).toBe('el sur-\nNorte')
  })
})

describe('regla 2 · collapseSoftBreaks', () => {
  it('junta saltos simples y conserva los dobles como párrafo', () => {
    expect(collapseSoftBreaks('Primera línea\nsegunda línea.\n\nOtro párrafo.')).toBe(
      'Primera línea segunda línea.\n\nOtro párrafo.'
    )
  })
})

describe('regla 3 · stripBoilerplateLines', () => {
  it('elimina la línea que se repite en la mayoría de las páginas', () => {
    const pages = [
      'Manual de usuario\nContenido de la página uno.',
      'Manual de usuario\nContenido de la página dos.',
      'Manual de usuario\nContenido de la página tres.'
    ]
    const out = stripBoilerplateLines(pages)
    expect(out.join('\n')).not.toContain('Manual de usuario')
    expect(out[1]).toContain('página dos')
  })
  it('no elimina nada si hay muy pocas páginas', () => {
    const pages = ['Cabecera\nUno.', 'Cabecera\nDos.']
    expect(stripBoilerplateLines(pages).join('\n')).toContain('Cabecera')
  })
})

describe('regla 4 · isPageNumberLine', () => {
  it('reconoce numeración de página en varias formas', () => {
    expect(isPageNumberLine('12')).toBe(true)
    expect(isPageNumberLine('  - 7 -')).toBe(true)
    expect(isPageNumberLine('Página 3')).toBe(true)
    expect(isPageNumberLine('12 / 340')).toBe(true)
  })
  it('no confunde texto normal con numeración', () => {
    expect(isPageNumberLine('Capítulo 3')).toBe(false)
    expect(isPageNumberLine('En 1999 ocurrió algo.')).toBe(false)
  })
})

describe('regla 5 · collapseSpaces', () => {
  it('colapsa espacios, tabuladores y saltos de sobra', () => {
    expect(collapseSpaces('hola    mundo\t\tcruel\n\n\n\nfin')).toBe('hola mundo cruel\n\nfin')
  })
})

describe('normalizePages · integración', () => {
  it('aplica todas las reglas y numera los párrafos por página', () => {
    const pages = [
      'Informe 2025\nEste informe resume el año. El texto continúa en la\nlínea siguiente sin cortar la idea.\n\nSegundo párrafo de la página uno.\n1',
      'Informe 2025\nLa página dos habla de otra cosa distinta con la palabra pre-\ncisión incluida.\n2'
    ]
    const paras = normalizePages(pages, { minPages: 2 })
    expect(paras.map((p) => p.page)).toEqual([1, 1, 2])
    expect(paras[0].text).toBe(
      'Este informe resume el año. El texto continúa en la línea siguiente sin cortar la idea.'
    )
    expect(paras[1].text).toBe('Segundo párrafo de la página uno.')
    expect(paras[2].text).toContain('precisión')
    expect(paras.some((p) => /Informe 2025/.test(p.text))).toBe(false)
    expect(paras.some((p) => /^\d+$/.test(p.text))).toBe(false)
  })
})
