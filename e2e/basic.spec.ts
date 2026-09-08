import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const ROOT = join(__dirname, '..')

/** El terminal de VS Code exporta ELECTRON_RUN_AS_NODE=1; hay que quitarlo. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

test('pegar texto, pulsar play y resaltar el primer párrafo (brief §10)', async () => {
  const app = await electron.launch({
    args: [join(ROOT, 'out/main/index.js')],
    cwd: ROOT,
    env: cleanEnv()
  })
  const win = await app.firstWindow()

  await win.locator('.input__textarea').fill('Párrafo uno de prueba.\n\nParrafo dos de prueba.')
  await win.getByRole('button', { name: 'Cargar texto' }).click()

  await expect(win.locator('.para')).toHaveCount(2)
  await expect(win.locator('.reader__meta')).toContainText('2 párrafos')

  await win.locator('.tbtn--play').click()

  // El párrafo 1 queda activo (resaltado) al empezar la reproducción.
  const first = win.locator('.para').first()
  await expect(first).toHaveClass(/para--active/)
  await expect(win.locator('.transport__meta')).toContainText('Párrafo 1 de 2')

  await app.close()
})
