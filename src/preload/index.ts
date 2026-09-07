import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type IpcEvent, type IpcEventPayload, type RendererApi } from '../shared/ipc'

const api: RendererApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo),
  ping: (message) => ipcRenderer.invoke(IpcChannel.AppPing, message),
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
