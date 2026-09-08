/**
 * Exporta el documento completo a un MP3 (brief §5.7, §7 crit 6). Sintetiza
 * cada párrafo con el motor remoto (aprovechando la caché en disco) y concatena
 * los bytes. La concatenación simple de MP3 basta para reproducir en cualquier
 * lector; los chunks ya sintetizados no se vuelven a pedir a la API.
 */
import { writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog } from 'electron'
import type { ExportMp3Request, ExportMp3Result } from '../../shared/ipc'
import { synthesize } from './remote'

export async function exportMp3(
  req: ExportMp3Request,
  sender: Electron.WebContents,
  onProgress: (done: number, total: number) => void
): Promise<ExportMp3Result> {
  const owner = BrowserWindow.fromWebContents(sender)
  const options: Electron.SaveDialogOptions = {
    title: 'Exportar MP3',
    defaultPath: 'lectura.mp3',
    filters: [{ name: 'MP3', extensions: ['mp3'] }]
  }
  const save = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options)
  if (save.canceled || !save.filePath) return { canceled: true }

  const parts: Buffer[] = []
  let chars = 0
  const total = req.paragraphs.length
  for (let i = 0; i < total; i++) {
    const { bytes, chars: c } = await synthesize({
      provider: req.provider,
      voiceId: req.voiceId,
      text: req.paragraphs[i],
      speed: req.speed
    })
    parts.push(Buffer.from(bytes))
    chars += c
    onProgress(i + 1, total)
  }

  await writeFile(save.filePath, Buffer.concat(parts))
  return { canceled: false, path: save.filePath, chars }
}
