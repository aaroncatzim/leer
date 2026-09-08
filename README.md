# Lector Audio

Aplicación de escritorio (Windows y macOS) que convierte texto pegado, PDF y
HTML en audio, con motor de voces del sistema (offline, gratis) y motores de
pago seleccionables (ElevenLabs / OpenAI TTS).

- Brief técnico: [`docs/brief-lector-audio.md`](docs/brief-lector-audio.md)
- Mockups (3 direcciones de layout, en exploración):
  [`docs/mockups.md`](docs/mockups.md) · lienzo:
  [`docs/Lector Audio - Mockups.html`](docs/Lector%20Audio%20-%20Mockups.html)

> **Estado: v1 completa (pasos 1–8 del brief).** Entrada por texto pegado,
> **URL**, **HTML** o **PDF** (con capa de texto o escaneado → OCR progresivo).
> Voz con el **motor del sistema** (offline), resaltado por párrafo y por
> palabra. Modal de **Ajustes** (idioma de OCR). Layout: dirección **1a** de los
> mockups. Empaquetado con electron-builder (DMG probado; NSIS listo, se genera
> en Windows).
>
> Los **motores remotos** (ElevenLabs / OpenAI) y **Exportar MP3** están
> implementados y probados pero **ocultos** tras
> [`REMOTE_TTS_ENABLED`](src/shared/features.ts) (`= false`). Ponerlo a `true`
> devuelve a la UI el selector de motor, «Exportar MP3» y los campos de API key.

## Stack

| Área         | Elección                          |
| ------------ | --------------------------------- |
| Runtime      | Electron 44                       |
| Build        | electron-vite 5 (Vite 7)          |
| UI           | React 19 + TypeScript 7           |
| Estado UI    | Zustand 5                         |
| Tests        | Vitest 5 (unitarios) · Playwright 1.63 (`_electron`, E2E) |
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
| `npm run test:e2e`              | E2E sobre Electron (Playwright): pegar texto → play → resaltado. |
| `npm run pack:dir`              | Empaqueta sin instalador (`electron-builder --dir`).       |
| `npm run dist:mac` / `dist:win` | Genera DMG / instalador NSIS.                              |

## Empaquetado y firma (paso 8)

- `npm run dist:mac` genera `release/<versión>/Lector Audio-<versión>-<arch>.dmg`
  (arm64 e Intel). `npm run dist:win` genera el instalador NSIS `.exe` y debe
  ejecutarse **en Windows** (o CI): NSIS necesita Windows/wine.
- Los idiomas de OCR (`resources/tessdata`) se incluyen con `extraResources`; el
  binario nativo de `@napi-rs/canvas` y el wasm de `tesseract.js` se sacan del
  `asar` (`asarUnpack`). El DMG arm64 se ha probado: arranca y hace OCR de un
  PDF escaneado.
- **Firma / notarización** se activan solas al exportar estas variables antes de
  `dist:*` (si faltan, electron-builder omite la firma con un aviso):

  | Plataforma | Variables |
  | ---------- | --------- |
  | macOS — firmar | `CSC_LINK` (ruta o base64 del `.p12`), `CSC_KEY_PASSWORD` |
  | macOS — notarizar | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
  | Windows — firmar | `CSC_LINK`, `CSC_KEY_PASSWORD` |

  Sin firmar: macOS pide botón derecho → «Abrir» la primera vez; Windows muestra
  el aviso de SmartScreen (brief §8).

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
- Las API keys se cifran con `safeStorage` (`encryptString`/`decryptString`,
  disponibles tras `app ready`) en `userData/secrets.bin`; el renderer solo
  recibe un booleano "configurada" y una pista enmascarada. El renderer nunca
  llama a las APIs de voz: lo hace el main.
- **Pendiente**: firma / notarización de los instaladores (paso 8).

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
6. ✅ Motor TTS remoto (ElevenLabs) + caché de audio + secretos:
   [`src/main/tts/remote.ts`](src/main/tts/remote.ts) llama a la API (verificada:
   `POST /v1/text-to-speech/{voice_id}`), cachea el mp3 por
   `sha256(provider|voz|modelo|velocidad|texto)`; [`src/main/settings.ts`](src/main/settings.ts)
   cifra las keys con `safeStorage`. Modal en
   [`src/renderer/src/components/Settings.tsx`](src/renderer/src/components/Settings.tsx).
   Segmentador §5.4 en [`src/shared/segment.ts`](src/shared/segment.ts) (con tests).
7. ✅ Segundo motor remoto (OpenAI, `POST /v1/audio/speech`, `gpt-4o-mini-tts` —
   verificado) + **Exportar MP3** ([`src/main/tts/exportMp3.ts`](src/main/tts/exportMp3.ts)):
   sintetiza cada párrafo (reusando caché), concatena y guarda con diálogo nativo.
8. ✅ Empaquetado con electron-builder (`electron-builder.yml`): DMG arm64/x64,
   NSIS x64, icono, `extraResources` de tessdata, `asarUnpack` de nativos,
   runtime endurecido + entitlements + `notarize` condicional. DMG arm64 probado.

Deliverables del brief §10: `README` (setup/build/keys) ✓ · tests del
normalizador y segmentador (Vitest) ✓ · E2E mínimo con Playwright para Electron
([`e2e/basic.spec.ts`](e2e/basic.spec.ts)) ✓ · instaladores `.dmg` (generado) /
`.exe` (se genera en Windows).
