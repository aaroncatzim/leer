/**
 * Contrato IPC: única fuente de verdad para la comunicación entre el proceso
 * `main` (Node) y el `renderer` (React). Compartido por ambos lados.
 *
 * Reglas (brief §3):
 *   - El renderer NUNCA usa `ipcRenderer` directamente; sólo `window.api`.
 *   - Cada acceso a disco / red / OCR se añade aquí como un canal tipado y se
 *     implementa con `ipcMain.handle` en el main.
 */

import type { LectorDocument } from './document'

/** Plataformas soportadas. Linux queda fuera de alcance en v1 (brief §2). */
export type Platform = 'darwin' | 'win32' | 'linux'

/** Canales petición-respuesta (`ipcRenderer.invoke` / `ipcMain.handle`). */
export const IpcChannel = {
  AppGetInfo: 'app:get-info',
  AppPing: 'app:ping',
  ExtractHtml: 'extract:html',
  ExtractPdf: 'extract:pdf',
  PickDocument: 'dialog:pick-document',
  OcrStart: 'ocr:start',
  OcrCancel: 'ocr:cancel'
} as const
export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/**
 * Origen de un extracto HTML (brief §5.2):
 *  - `url`  : el main descarga (nunca el renderer).
 *  - `file` : el main lee la ruta (elegida con el diálogo nativo).
 *  - `html` : HTML ya en memoria (archivo soltado y leído en el renderer).
 */
export type HtmlSource =
  | { kind: 'url'; url: string }
  | { kind: 'file'; path: string }
  | { kind: 'html'; html: string; label?: string }

/**
 * Origen de un extracto PDF:
 *  - `file`  : el main lee la ruta.
 *  - `bytes` : PDF ya en memoria (archivo soltado y leído en el renderer).
 */
export type PdfSource =
  | { kind: 'file'; path: string }
  | { kind: 'bytes'; bytes: ArrayBuffer; label?: string }

/** Eventos que el main empuja al renderer (`webContents.send`). */
export const IpcEvent = {
  OpenSettings: 'ui:open-settings',
  OcrProgress: 'ocr:progress',
  OcrPage: 'ocr:page',
  OcrDone: 'ocr:done'
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
  [IpcEvent.OcrProgress]: { ocrId: string; page: number; total: number; done: number }
  [IpcEvent.OcrPage]: { ocrId: string; page: number; paragraphs: string[] }
  [IpcEvent.OcrDone]: { ocrId: string; error?: string }
}

/** Superficie que el preload expone en `window.api`. */
export interface RendererApi {
  getAppInfo(): Promise<AppInfo>
  ping(message: string): Promise<PingResult>
  /**
   * Descarga (URL) o lee (archivo) un HTML en el proceso principal, lo pasa por
   * Readability y devuelve el documento. Rechaza con un mensaje legible si
   * falla la descarga o el recurso no es HTML.
   */
  extractHtml(source: HtmlSource): Promise<LectorDocument>
  /**
   * Extrae el texto de un PDF con `pdfjs-dist` (sin OCR) y lo normaliza. Rechaza
   * si el PDF no se puede abrir o no tiene capa de texto.
   */
  extractPdf(source: PdfSource): Promise<LectorDocument>
  /**
   * Lanza el OCR de las páginas indicadas de un PDF. Devuelve el `ocrId` de la
   * ejecución; el progreso y el texto llegan por los eventos `ocr:progress`,
   * `ocr:page` y `ocr:done`.
   */
  startOcr(source: PdfSource, pages: number[]): Promise<string>
  /** Cancela una ejecución de OCR y termina su worker. */
  cancelOcr(ocrId: string): Promise<void>
  /** Diálogo nativo para elegir un PDF o HTML. `null` si se cancela. */
  pickDocument(): Promise<string | null>
  /**
   * Suscribe a un evento main -> renderer.
   * @returns función para cancelar la suscripción.
   */
  on<E extends IpcEvent>(event: E, listener: (payload: IpcEventPayload[E]) => void): () => void
}
