# Brief técnico — Lector de texto a audio (escritorio)

## 1. Objetivo
Aplicación de escritorio para Windows y macOS que recibe texto (pegado), archivos PDF (con o sin capa de texto) y HTML (archivo o URL), extrae el texto legible y lo reproduce en voz, con dos motores seleccionables: voces del sistema (offline, gratis) y API de pago (ElevenLabs u OpenAI TTS).

## 2. Fuera de alcance (v1)
- Linux.
- Edición del texto extraído dentro de la app (solo lectura).
- Sincronización palabra por palabra en el modo remoto (solo por párrafo).
- Traducción o resumen.
- Exportar audio desde el motor local (Web Speech no expone el buffer de audio).

## 3. Stack
- Electron + Vite + React + TypeScript.
- Empaquetado: electron-builder (NSIS para Windows, DMG para macOS).
- Extracción PDF: `pdfjs-dist`.
- OCR: `tesseract.js` con idioma `spa` (+ `eng` opcional).
- Limpieza HTML: `@mozilla/readability` + `jsdom` (en el main process, no en el renderer).
- Estado UI: Zustand (o Context si prefieres cero dependencias).
- Persistencia de ajustes: `electron-store` o JSON en `app.getPath('userData')`.
- Secretos: `safeStorage` de Electron para cifrar la API key en disco. **Verificar la API actual de `safeStorage` y `contextBridge` en la documentación de Electron antes de implementar; no asumir firmas de memoria.**

Regla de seguridad obligatoria: `contextIsolation: true`, `nodeIntegration: false`, todo acceso a disco/red/OCR pasa por IPC tipado (`preload.ts` con `contextBridge`). La API key nunca llega al renderer en texto plano.

## 4. Arquitectura (procesos)

```
┌──────────────── Renderer (React) ────────────────┐
│ UI: entrada, lista de párrafos, controles player │
│ TTSProvider local: window.speechSynthesis        │
│ Reproductor remoto: <audio> + cola de chunks     │
└───────────────┬──────────────────────────────────┘
                │ IPC tipado (preload)
┌───────────────▼──── Main (Node) ─────────────────┐
│ extract:pdf   → pdfjs → fallback OCR (worker)    │
│ extract:html  → jsdom + Readability              │
│ tts:remote    → ElevenLabs/OpenAI → mp3 en caché │
│ settings, secrets (safeStorage)                  │
└──────────────────────────────────────────────────┘
```

## 5. Módulos y contratos

### 5.1 `Document` (modelo central)
```ts
type Paragraph = { id: string; text: string; page?: number };
type Document = {
  id: string;             // hash sha256 del texto normalizado
  source: 'text' | 'pdf' | 'html';
  title: string;
  paragraphs: Paragraph[];
  warnings: string[];     // ej. "Páginas 3-7 procesadas con OCR; puede contener errores"
};
```

### 5.2 Extractores (main process)
Interfaz común: `extract(input): Promise<Document>`.

- **Texto:** dividir por líneas en blanco dobles; si no hay, por saltos simples.
- **HTML:** archivo local o URL. Descargar en main (no en renderer). Pasar por Readability; si Readability devuelve `null`, usar `document.body.textContent` y añadir warning. Eliminar `<script>`, `<style>`, `<nav>`, `<footer>`.
- **PDF:** por página, `getTextContent()` de pdfjs. Heurística de OCR: si una página tiene menos de ~50 caracteres alfabéticos, rasterizarla a ~200 DPI y pasarla por tesseract. Ejecutar OCR en un worker separado y emitir progreso por IPC (`ocr:progress { page, total }`). Cancelable.

### 5.3 Normalizador
Aplicar en orden, sobre el texto de cada página/bloque:
1. Unir palabras cortadas por guion al final de línea (`infor-\nmación` → `información`).
2. Colapsar saltos de línea simples dentro de un párrafo; conservar dobles.
3. Eliminar líneas que se repiten en ≥ 60 % de las páginas (encabezados/pies).
4. Eliminar líneas que son solo un número (numeración de página).
5. Colapsar espacios múltiples.

Cada regla debe tener test unitario con un caso de entrada/salida.

### 5.4 Segmentador
- Unidad base: párrafo.
- Para el motor remoto, agrupar párrafos consecutivos en chunks de máximo N caracteres (N configurable; empezar en 3 000). Nunca partir a mitad de frase: cortar en `. ! ? ;`.
- Para el motor local, enviar párrafo por párrafo (Web Speech falla en Chromium con textos largos; esto es conocido, verificar comportamiento actual).

### 5.5 Proveedores TTS (interfaz única)
```ts
interface TTSProvider {
  id: 'system' | 'elevenlabs' | 'openai';
  listVoices(): Promise<Voice[]>;
  speak(chunk: Chunk, opts: { voiceId: string; rate: number }): Promise<void>;
  pause(): void; resume(): void; stop(): void;
  onParagraphStart(cb: (paragraphId: string) => void): void;
  canExport: boolean;
}
```
- **system:** envuelve `speechSynthesis`. Usar `onboundary` para resaltado si está disponible; si no, resaltar por párrafo.
- **elevenlabs / openai:** el renderer pide `tts:synthesize(chunkId)` al main; el main devuelve ruta del mp3 (o buffer). El renderer reproduce con `<audio>` y precarga el siguiente chunk mientras suena el actual. Los endpoints, nombres de modelo y parámetros deben tomarse de la documentación vigente de cada proveedor en el momento de implementar; no hardcodear valores de memoria.

### 5.6 Caché de audio remoto
- Clave: `sha256(providerId + voiceId + modelo + texto del chunk)`.
- Almacenar en `userData/tts-cache/<hash>.mp3`.
- Antes de cualquier llamada a la API, consultar caché. Mostrar en ajustes el tamaño de caché y botón para vaciarla.
- Contador de caracteres enviados a la API en la sesión, visible en la UI.

### 5.7 UI (una sola ventana)
- Panel izquierdo: entrada — textarea, botón "Abrir PDF/HTML", campo URL. Drag & drop de archivos.
- Panel central: lista de párrafos; el activo resaltado; clic en un párrafo salta a él.
- Barra inferior: play/pause/stop, anterior/siguiente párrafo, velocidad (0.5–2.0), selector de motor, selector de voz, progreso (párrafo x de y).
- Ajustes (modal): API keys por proveedor (guardadas cifradas), idioma OCR, tamaño de chunk, caché.
- Banner de warnings del documento (OCR aplicado, Readability falló, etc.).
- Exportar MP3 (solo motor remoto): concatena los chunks ya generados.

## 6. Comportamientos obligatorios
- Cambiar de motor a mitad de lectura conserva el párrafo actual.
- Cerrar la app a mitad de OCR cancela el worker sin dejar procesos huérfanos.
- Sin conexión + motor remoto: error claro y sugerencia de cambiar a motor local, sin crashear.
- Un PDF de 200 páginas escaneadas no bloquea la UI: OCR progresivo, se puede empezar a escuchar las páginas ya procesadas.
- La app arranca y funciona sin ninguna API key configurada.

## 7. Criterios de aceptación (v1)
1. Pegar 5 párrafos de texto y escucharlos con voz del sistema en Windows y macOS, con resaltado por párrafo.
2. Abrir un PDF con capa de texto de ≥ 20 páginas: extracción < 3 s, sin encabezados repetidos en la lectura.
3. Abrir un PDF escaneado de 5 páginas: OCR con barra de progreso, warning visible, texto reproducible.
4. Abrir una URL de noticia: se lee el artículo, no el menú ni el footer.
5. Con API key de ElevenLabs configurada: reproducir, pausar, saltar párrafo; repetir un párrafo no genera segunda llamada a la API (verificar por contador).
6. Exportar MP3 del documento completo en modo remoto.
7. Instaladores generados para ambas plataformas.

## 8. Orden de implementación sugerido
1. Scaffold Electron + Vite + React + TS con IPC tipado y ventana vacía.
2. Entrada de texto + motor `system` + player. (Primer hito usable.)
3. Extractor HTML.
4. Extractor PDF sin OCR + normalizador con tests.
5. OCR como fallback con worker y progreso.
6. Proveedor remoto (uno primero) + caché + secretos.
7. Segundo proveedor remoto, exportar MP3.
8. Empaquetado y firma (macOS requiere notarización; Windows sin firma mostrará SmartScreen).

## 9. Riesgos conocidos
- Calidad OCR en escaneados torcidos o con columnas: baja. Aceptado en v1; documentar.
- Voces en español del sistema varían por SO y versión; no controlable.
- Web Speech en Chromium puede cortarse en párrafos largos; el segmentador por párrafo lo mitiga.
- Costo de API: depende del proveedor y cambia; el contador de caracteres y la caché son la mitigación.
- Notarización en macOS requiere cuenta de desarrollador de Apple.

## 10. Entregables
- Repositorio con `README` (setup, build, cómo configurar keys).
- Tests unitarios del normalizador y segmentador (Vitest).
- Un test E2E mínimo con Playwright para Electron: abrir app, pegar texto, pulsar play, verificar que el párrafo 1 queda resaltado.
- Instaladores `.exe` y `.dmg`.
