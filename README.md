# Lector Audio

Aplicación de escritorio (Windows y macOS) que convierte texto pegado, PDF y
HTML en audio, con motor de voces del sistema (offline, gratis) y motores de
pago seleccionables (ElevenLabs / OpenAI TTS). Brief técnico completo en
[`docs/brief-lector-audio.md`](docs/brief-lector-audio.md).

> **Estado: scaffold** (paso 1 del brief). Ventana vacía + IPC tipado.
> Todavía sin extractores, sin TTS y sin ajustes.

## Stack

| Área         | Elección                          |
| ------------ | --------------------------------- |
| Runtime      | Electron 44                       |
| Build        | electron-vite 5 (Vite 7)          |
| UI           | React 19 + TypeScript 7           |
| Estado UI    | Zustand 5 (aún sin stores)        |
| Empaquetado  | electron-builder 26 (NSIS / DMG)  |

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
| `npm run pack:dir`              | Empaqueta sin instalador (`electron-builder --dir`).       |
| `npm run dist:mac` / `dist:win` | Genera DMG / instalador NSIS.                              |

## Estructura

```
src/
  main/        Proceso principal (Node): ventana, ciclo de vida, IPC, CSP.
  preload/     Puente contextBridge -> window.api (única superficie IPC).
  renderer/    App React (Chromium, sin Node).
  shared/      Contrato IPC tipado, compartido por main y renderer.
scripts/
  dev.mjs      Lanza electron-vite sin ELECTRON_RUN_AS_NODE (ver arriba).
electron.vite.config.ts
electron-builder.yml
```

Todo el TypeScript se comprueba con dos proyectos separados
(`tsconfig.node.json` para main/preload/shared, `tsconfig.web.json` para
renderer/shared) para no mezclar los globals de Node y del DOM.

## Modelo de seguridad

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- El renderer no toca `ipcRenderer`: sólo usa `window.api`, tipado en
  [`src/shared/ipc.ts`](src/shared/ipc.ts). Cada operación de disco / red / OCR
  se añadirá como un canal tipado con `ipcMain.handle`.
- CSP aplicada por cabecera de respuesta (`onHeadersReceived`); estricta en
  producción (`default-src 'self'`, `connect-src 'self'`).
- Navegación fuera de la app bloqueada; los enlaces externos abren en el
  navegador del sistema.
- **Pendiente** (fases posteriores): cifrado de las API keys con `safeStorage`
  —verificar la API vigente de Electron antes de implementar, no asumir firmas
  de memoria—, y firma / notarización de los instaladores.

## Roadmap (orden del brief §8)

1. ✅ Scaffold Electron + Vite + React + TS, IPC tipado, ventana vacía.
2. ⬜ Entrada de texto + motor `system` + reproductor (primer hito usable).
3. ⬜ Extractor HTML (`@mozilla/readability` en el main).
4. ⬜ Extractor PDF sin OCR + normalizador con tests (Vitest).
5. ⬜ OCR como fallback (`tesseract.js` en worker, progreso por IPC).
6. ⬜ Proveedor TTS remoto (uno) + caché de audio + secretos.
7. ⬜ Segundo proveedor remoto + exportar MP3.
8. ⬜ Empaquetado y firma (notarización macOS, SmartScreen Windows).
