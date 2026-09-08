import { describe, expect, it } from 'vitest'
import { htmlToParagraphs } from './html'

const page = (body: string, head = '<title>T</title>'): string =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

describe('htmlToParagraphs', () => {
  it('extrae un artículo real vía Readability y descarta menús/pies', () => {
    const html = page(`
      <nav><a href="/">Inicio</a><a href="/tema">Sección</a></nav>
      <article>
        <h1>La fotosíntesis</h1>
        <p>La fotosíntesis convierte la energía luminosa en energía química almacenada en azúcares.</p>
        <p>Ocurre en los cloroplastos, que contienen el pigmento verde llamado clorofila.</p>
        <p>El proceso libera oxígeno como subproducto de la ruptura de las moléculas de agua.</p>
      </article>
      <footer>Aviso legal · Cookies</footer>
    `)
    const { paragraphs, usedReadability } = htmlToParagraphs(html)
    expect(usedReadability).toBe(true)
    expect(paragraphs.length).toBeGreaterThanOrEqual(3)
    expect(paragraphs.join(' ')).toContain('clorofila')
    expect(paragraphs.join(' ')).not.toContain('Aviso legal')
    expect(paragraphs.join(' ')).not.toContain('Inicio')
  })

  it('usa el fallback (usedReadability=false) cuando Readability no devuelve nada', () => {
    const { paragraphs, usedReadability } = htmlToParagraphs(page('<div></div>'))
    expect(usedReadability).toBe(false)
    expect(paragraphs).toEqual([])
  })

  it('siempre elimina script, style, nav y footer', () => {
    const html = page(
      '<style>.x{color:red}</style><nav>Menú Inicio Contacto</nav>' +
        '<article><p>Cuerpo real del artículo, con la longitud suficiente para superar el umbral de Readability.</p>' +
        '<p>Un segundo párrafo con contenido de relleno para asegurar la extracción.</p></article>' +
        '<footer>Aviso legal y pie de página</footer>'
    )
    const joined = htmlToParagraphs(html).paragraphs.join(' ')
    expect(joined).toContain('Cuerpo real del artículo')
    expect(joined).not.toMatch(/Menú|Aviso legal|color:red/)
  })

  it('colapsa el espacio en blanco dentro de cada bloque', () => {
    const html = page('<article><p>Texto   con\n\tespacios\n   raros.</p><p>Segundo.</p><p>Tercero de relleno para el umbral.</p></article>')
    const { paragraphs } = htmlToParagraphs(html)
    expect(paragraphs[0]).toBe('Texto con espacios raros.')
  })

  it('no duplica bloques anidados (blockquote > p)', () => {
    const html = page(
      '<article><blockquote><p>Cita anidada que no debe salir dos veces.</p></blockquote>' +
        '<p>Párrafo normal uno.</p><p>Párrafo normal dos para el umbral.</p></article>'
    )
    const { paragraphs } = htmlToParagraphs(html)
    const hits = paragraphs.filter((p) => p.includes('Cita anidada')).length
    expect(hits).toBe(1)
  })
})
