# Lector Audio

Aplicación de escritorio (Windows y macOS) que convierte texto pegado, PDF y
HTML en audio, con motor de voces del sistema (offline, gratis) y motores de
pago seleccionables (ElevenLabs / OpenAI TTS).

- Brief técnico: [`docs/brief-lector-audio.md`](docs/brief-lector-audio.md)
- Mockups (3 direcciones de layout, en exploración):
  [`docs/mockups.md`](docs/mockups.md) · lienzo:
  [`docs/Lector Audio - Mockups.html`](docs/Lector%20Audio%20-%20Mockups.html)

> **Estado: paso 5 del brief.** Entrada por texto pegado, **URL**, **HTML** o
> **PDF** (con capa de texto o escaneado). El HTML pasa por Readability; el PDF
> se extrae con `pdfjs-dist` y se normaliza; las páginas sin texto pasan por
> **OCR** (`tesseract.js` + `@napi-rs/canvas`, idioma `spa` empaquetado, sin
> red) de forma progresiva, con barra, cancelable, y se puede ir escuchando lo
> ya reconocido. Reproducción con la voz del sistema (offline), resaltado por
> párrafo y por palabra. Layout: dirección **1a**. Falta: motores TTS remotos,
> exportar MP3 y modal de ajustes.

## Stack

| Área         | Elección                          |
| ------------ | --------------------------------- |
| Runtime      | Electron 44                       |
| Build        | electron-vite 5 (Vite 7)          |
| UI           | React 19 + TypeScript 7           |
| Estado UI    | Zustand 5                         |
| Tests        | Vitest 5                          |
| Extracción   | jsdom + @mozilla/readability · pdfjs-dist · tesseract.js + @napi-rs/canvas |
| Empaquetado  | electron-builder 26 (NSIS / DMG)  |
| Tipografía   | Atkinson Hyperlegible + Public Sans (subset latino local) |

`electron-vite` sólo admite Vite ≤ 7, por eso Vite queda fijado en la línea 7.x
y `@vitejs/plugin-react` en la 5.x.

## Requisitos

- Node.js ≥ 20.19 (probado con v26).
- npm 10+.

## Puesta en marcha

```bash
npm install        # el `postinstall` descarga el binario de Electron
npm run dev        # Electron + Vite con HMR en el renderer
```

Notas de instalación:

- **Binario de Electron.** `electron@44` ya no trae script `postinstall`, así que
  el binario (~170 MB) no se descarga solo. Este proyecto añade un `postinstall`
  propio que ejecuta `node_modules/electron/install.js` (es idempotente). Si
  hiciera falta a mano: `npm run postinstall`.
- **Aviso `allowScripts` de npm.** npm 11 lista paquetes con scripts de
  instalación sin revisar (`esbuild`, `electron-winstaller`). Hoy es solo un
  aviso; para silenciarlo: `npm approve-scripts --all`.
- **VS Code.** El terminal integrado exporta `ELECTRON_RUN_AS_NODE=1`, lo que
  haría que Electron arrancara como Node y la app fallara. `scripts/dev.mjs`
  elimina esa variable antes de lanzar `electron-vite`, así que `npm run dev` y
  `npm run preview` funcionan igual dentro y fuera de VS Code.

## Scripts

| Script                          | Qué hace                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                   | Desarrollo: Electron + Vite, HMR en el renderer.           |
| `npm run build`                 | Compila `main`, `preload` y `renderer` a `out/`.           |
| `npm run preview`               | Ejecuta el build de `out/` sin empaquetar.                 |
| `npm run typecheck`             | `tsc --noEmit` de los proyectos node y web.                |
| `npm test`                      | Tests unitarios (Vitest).                                  |
| `npm run pack:dir`              | Empaqueta sin instalador (`electron-builder --dir`).       |
| `npm run dist:mac` / `dist:win` | Genera DMG / instalador NSIS.                              |

## Estructura

```
src/
  main/        Proceso principal (Node): ventana, ciclo de vida, IPC, CSP.
    extract/html.ts  Descarga/lee HTML y lo pasa por jsdom + Readability.
    extract/pdf.ts   Extrae texto de PDF con pdfjs-dist (sin OCR).
    ocr/pdfOcr.ts    Rasteriza (canvas) + OCR (tesseract.js) de páginas escaneadas.
  preload/     Puente contextBridge -> window.api (única superficie IPC).
  renderer/    App React (Chromium, sin Node).
    src/lib/tts.ts    SystemTtsProvider (window.speechSynthesis).
    src/store.ts      Estado del reproductor (Zustand) + bucle de reproducción.
    src/components/    InputPanel · Reader · Transport.
    src/assets/fonts/  Subset latino de las fuentes, sin red.
  shared/      Contrato IPC tipado, modelo `document` y `normalize.ts` (§5.3),
               compartidos main ↔ renderer.
scripts/
  dev.mjs      Lanza electron-vite sin ELECTRON_RUN_AS_NODE (ver arriba).
electron.vite.config.ts · electron-builder.yml · vitest.config.ts
```

Todo el TypeScript se comprueba con dos proyectos separados
(`tsconfig.node.json` para main/preload/shared, `tsconfig.web.json` para
renderer/shared) para no mezclar los globals de Node y del DOM.

## Modelo de seguridad

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- El renderer no toca `ipcRenderer`: sólo usa `window.api`, tipado en
  [`src/shared/ipc.ts`](src/shared/ipc.ts). Cada operación de disco / red / OCR
  es un canal tipado con `ipcMain.handle`.
- La descarga de URLs la hace el proceso principal (`fetch` con timeout, límite
  de tamaño y comprobación de `content-type`); el renderer nunca sale a la red.
- CSP aplicada por cabecera de respuesta (`onHeadersReceived`); estricta en
  producción (`default-src 'self'`, `connect-src 'self'`).
- Navegación fuera de la app bloqueada; los enlaces externos abren en el
  navegador del sistema.
- **Pendiente** (fases posteriores): cifrado de las API keys con `safeStorage`
  —verificar la API vigente de Electron antes de implementar, no asumir firmas
  de memoria—, y firma / notarización de los instaladores.

## Roadmap (orden del brief §8)

1. ✅ Scaffold Electron + Vite + React + TS, IPC tipado, ventana vacía.
2. ✅ Entrada de texto + motor `system` + reproductor (primer hito usable).
   Layout 1a de [`docs/mockups.md`](docs/mockups.md). Resaltado por párrafo y por
   palabra (`onboundary`). Tests del segmentador en
   [`src/renderer/src/lib/document.test.ts`](src/renderer/src/lib/document.test.ts).
3. ✅ Extractor HTML: URL / archivo / HTML soltado → `jsdom` + `@mozilla/readability`
   en el main (canal `extract:html`), con fallback al cuerpo completo + aviso.
   Tests en [`src/main/extract/html.test.ts`](src/main/extract/html.test.ts).
4. ✅ Extractor PDF sin OCR: `pdfjs-dist` en el main (canal `extract:pdf`),
   página a página, + normalizador ([`src/shared/normalize.ts`](src/shared/normalize.ts),
   una regla = un test). Marca las páginas sin capa de texto para el OCR.
5. ✅ OCR de esas páginas ([`src/main/ocr/pdfOcr.ts`](src/main/ocr/pdfOcr.ts)):
   rasteriza con `@napi-rs/canvas` a ~200 DPI y reconoce con `tesseract.js`
   (`spa` en [`resources/tessdata`](resources/tessdata), sin red). Progreso por
   `ocr:progress`/`ocr:page`, cancelable, y termina los workers al cerrar.
6. ⬜ Proveedor TTS remoto (uno) + caché de audio + secretos.
7. ⬜ Segundo proveedor remoto + exportar MP3.
8. ⬜ Empaquetado y firma (notarización macOS, SmartScreen Windows).
