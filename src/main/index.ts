import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import {
  IpcChannel,
  IpcEvent,
  type AppInfo,
  type HtmlSource,
  type PingResult,
  type Platform
} from '../shared/ipc'
import { extractHtml } from './extract/html'

const isDev = !app.isPackaged
const APP_USER_MODEL_ID = 'com.aaroncatzim.lectoraudio'

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

  ipcMain.handle(IpcChannel.PickHtmlFile, async (event): Promise<string | null> => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Abrir HTML',
      properties: ['openFile'],
      filters: [{ name: 'HTML', extensions: ['html', 'htm', 'xhtml'] }]
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
