import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import type { Worker as TesseractWorker } from 'tesseract.js'
import {
  IpcChannel,
  IpcEvent,
  type AppInfo,
  type HtmlSource,
  type PdfSource,
  type PingResult,
  type Platform,
  type ExportMp3Request,
  type RemoteProvider,
  type SettingsPatch,
  type SettingsView,
  type SynthesizeRequest
} from '../shared/ipc'
import { extractHtml } from './extract/html'
import { extractPdf, loadPdfBytes } from './extract/pdf'
import { ocrPdfPages } from './ocr/pdfOcr'
import {
  cacheSizeBytes,
  clearCache,
  clearSecret,
  encryptionAvailable,
  readSettings,
  secretHint,
  setSecret,
  writeSettings
} from './settings'
import { exportMp3 } from './tts/exportMp3'
import { listRemoteVoices, synthesize } from './tts/remote'

const isDev = !app.isPackaged
const APP_USER_MODEL_ID = 'com.aaroncatzim.lectoraudio'

interface OcrRun {
  signal: { cancelled: boolean }
  worker?: TesseractWorker
}
const ocrRuns = new Map<string, OcrRun>()

function cancelOcrRun(run: OcrRun | undefined): void {
  if (!run) return
  run.signal.cancelled = true
  void run.worker?.terminate().catch(() => undefined)
}

/**
 * CSP aplicada por cabecera de respuesta (cubre todo recurso, más fiable que
 * un `<meta>`). En dev se relaja para el preámbulo de React Refresh y el
 * websocket de HMR; en producción el renderer se carga por `file://` y no
 * hace red (todo sale por IPC), así que `connect-src 'self'`.
 */
const CSP = (
  isDev
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "media-src 'self' blob:",
        "connect-src 'self' ws://localhost:* http://localhost:*"
      ]
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "media-src 'self' blob:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'"
      ]
).join('; ')

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#14161a',
    title: 'Lector Audio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, // obligatorio (brief §3)
      nodeIntegration: false, // obligatorio (brief §3)
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  window.once('ready-to-show', () => window.show())

  // Nada navega dentro de la ventana; los enlaces externos van al navegador.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (isDev && devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(
    IpcChannel.AppGetInfo,
    (): AppInfo => ({
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      // Sólo darwin/win32 son de interés en v1; el resto se etiqueta igual.
      platform: process.platform as Platform
    })
  )

  ipcMain.handle(
    IpcChannel.AppPing,
    (_event, message: string): PingResult => ({
      pong: `main recibió: ${JSON.stringify(message)}`,
      at: Date.now()
    })
  )

  // El rechazo se propaga al `invoke` del renderer como promesa rechazada.
  ipcMain.handle(IpcChannel.ExtractHtml, (_event, source: HtmlSource) => extractHtml(source))
  ipcMain.handle(IpcChannel.ExtractPdf, (_event, source: PdfSource) => extractPdf(source))

  ipcMain.handle(
    IpcChannel.OcrStart,
    async (event, source: PdfSource, pages: number[], lang: 'spa' | 'spa+eng'): Promise<string> => {
      const ocrId = randomUUID()
      const run: OcrRun = { signal: { cancelled: false } }
      ocrRuns.set(ocrId, run)

      const send = (channel: string, payload: unknown): void => {
        if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
      }

      const { data } = await loadPdfBytes(source)
      void ocrPdfPages({
        data,
        pages,
        lang,
        signal: run.signal,
        registerWorker: (w) => (run.worker = w),
        onProgress: (p) => send(IpcEvent.OcrProgress, { ocrId, ...p }),
        onPage: (r) => send(IpcEvent.OcrPage, { ocrId, page: r.page, paragraphs: r.paragraphs })
      }).then(
        () => send(IpcEvent.OcrDone, { ocrId }),
        (err: unknown) =>
          send(IpcEvent.OcrDone, { ocrId, error: err instanceof Error ? err.message : String(err) })
      ).finally(() => ocrRuns.delete(ocrId))

      return ocrId
    }
  )

  ipcMain.handle(IpcChannel.OcrCancel, (_event, ocrId: string): void => {
    cancelOcrRun(ocrRuns.get(ocrId))
  })

  // ── Motor TTS remoto + ajustes (paso 6) ──────────────────────────
  ipcMain.handle(IpcChannel.ListRemoteVoices, (_e, provider: RemoteProvider) =>
    listRemoteVoices(provider)
  )
  ipcMain.handle(IpcChannel.Synthesize, (_e, req: SynthesizeRequest) => synthesize(req))

  async function settingsView(): Promise<SettingsView> {
    const s = readSettings()
    return {
      chunkChars: s.chunkChars,
      ocrLang: s.ocrLang,
      encryptionAvailable: encryptionAvailable(),
      cacheBytes: await cacheSizeBytes(),
      keys: {
        elevenlabs: { configured: secretHint('elevenlabs') !== null, hint: secretHint('elevenlabs') },
        openai: { configured: secretHint('openai') !== null, hint: secretHint('openai') }
      }
    }
  }

  ipcMain.handle(IpcChannel.SettingsGet, () => settingsView())
  ipcMain.handle(IpcChannel.SettingsSet, (_e, patch: SettingsPatch) => {
    writeSettings(patch)
    return settingsView()
  })
  ipcMain.handle(IpcChannel.SetSecret, (_e, provider: RemoteProvider, key: string) =>
    setSecret(provider, key)
  )
  ipcMain.handle(IpcChannel.ClearSecret, (_e, provider: RemoteProvider) => clearSecret(provider))
  ipcMain.handle(IpcChannel.ClearCache, () => clearCache())

  ipcMain.handle(IpcChannel.TtsExport, (event, req: ExportMp3Request) =>
    exportMp3(req, event.sender, (done, total) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IpcEvent.ExportProgress, { done, total })
      }
    })
  )

  ipcMain.handle(IpcChannel.PickDocument, async (event): Promise<string | null> => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Abrir PDF o HTML',
      properties: ['openFile'],
      filters: [
        { name: 'Documentos', extensions: ['pdf', 'html', 'htm', 'xhtml'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'HTML', extensions: ['html', 'htm', 'xhtml'] }
      ]
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = []
  if (process.platform === 'darwin') template.push({ role: 'appMenu' })
  template.push(
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Herramientas',
      submenu: [
        {
          label: 'Ajustes…',
          accelerator: 'CmdOrCtrl+,',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send(IpcEvent.OpenSettings)
        }
      ]
    }
  )
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

void app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID)

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP]
      }
    })
  })

  registerIpcHandlers()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Cerrar la app a mitad de OCR termina los workers sin dejarlos huérfanos
// (brief §6).
app.on('before-quit', () => {
  for (const run of ocrRuns.values()) cancelOcrRun(run)
  ocrRuns.clear()
})
