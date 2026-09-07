/**
 * Contrato IPC: única fuente de verdad para la comunicación entre el proceso
 * `main` (Node) y el `renderer` (React). Compartido por ambos lados.
 *
 * Reglas (brief §3):
 *   - El renderer NUNCA usa `ipcRenderer` directamente; sólo `window.api`.
 *   - Cada acceso a disco / red / OCR se añade aquí como un canal tipado y se
 *     implementa con `ipcMain.handle` en el main.
 */

/** Plataformas soportadas. Linux queda fuera de alcance en v1 (brief §2). */
export type Platform = 'darwin' | 'win32' | 'linux'

/** Canales petición-respuesta (`ipcRenderer.invoke` / `ipcMain.handle`). */
export const IpcChannel = {
  AppGetInfo: 'app:get-info',
  AppPing: 'app:ping'
} as const
export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Eventos que el main empuja al renderer (`webContents.send`). */
export const IpcEvent = {
  OpenSettings: 'ui:open-settings'
} as const
export type IpcEvent = (typeof IpcEvent)[keyof typeof IpcEvent]

export interface AppInfo {
  appVersion: string
  electron: string
  node: string
  chrome: string
  platform: Platform
}

export interface PingResult {
  pong: string
  at: number
}

/** Payload de cada evento push; `void` = sin datos. */
export interface IpcEventPayload {
  [IpcEvent.OpenSettings]: void
}

/** Superficie que el preload expone en `window.api`. */
export interface RendererApi {
  getAppInfo(): Promise<AppInfo>
  ping(message: string): Promise<PingResult>
  /**
   * Suscribe a un evento main -> renderer.
   * @returns función para cancelar la suscripción.
   */
  on<E extends IpcEvent>(event: E, listener: (payload: IpcEventPayload[E]) => void): () => void
}
