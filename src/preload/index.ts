import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type IpcEvent, type IpcEventPayload, type RendererApi } from '../shared/ipc'

/**
 * `ipcRenderer.invoke` envuelve el rechazo del main como
 * `Error: Error invoking remote method '…': Error: <mensaje real>`.
 * Se rehace el error con solo el mensaje real para que llegue limpio a la UI.
 */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    throw new Error(raw.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, ''))
  }
}

const api: RendererApi = {
  getAppInfo: () => invoke(IpcChannel.AppGetInfo),
  ping: (message) => invoke(IpcChannel.AppPing, message),
  extractHtml: (source) => invoke(IpcChannel.ExtractHtml, source),
  extractPdf: (source) => invoke(IpcChannel.ExtractPdf, source),
  startOcr: (source, pages, lang) => invoke(IpcChannel.OcrStart, source, pages, lang),
  cancelOcr: (ocrId) => invoke(IpcChannel.OcrCancel, ocrId),
  listRemoteVoices: (provider) => invoke(IpcChannel.ListRemoteVoices, provider),
  synthesize: (req) => invoke(IpcChannel.Synthesize, req),
  getSettings: () => invoke(IpcChannel.SettingsGet),
  setSettings: (patch) => invoke(IpcChannel.SettingsSet, patch),
  setSecret: (provider, key) => invoke(IpcChannel.SetSecret, provider, key),
  clearSecret: (provider) => invoke(IpcChannel.ClearSecret, provider),
  clearAudioCache: () => invoke(IpcChannel.ClearCache),
  pickDocument: () => invoke(IpcChannel.PickDocument),
  on: <E extends IpcEvent>(event: E, listener: (payload: IpcEventPayload[E]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: IpcEventPayload[E]): void =>
      listener(payload)
    ipcRenderer.on(event, handler)
    return () => {
      ipcRenderer.removeListener(event, handler)
    }
  }
}

// Con `contextIsolation: true` (obligatorio) contextBridge es la única vía de
// exposición. El renderer sólo ve este objeto, nunca `ipcRenderer`.
contextBridge.exposeInMainWorld('api', api)
