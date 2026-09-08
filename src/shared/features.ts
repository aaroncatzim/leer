/**
 * Interruptores de funcionalidad.
 *
 * `REMOTE_TTS_ENABLED`: motores de voz remotos (ElevenLabs / OpenAI). Apagados
 * por ahora — la app funciona solo con la voz del sistema (offline). Ponerlo a
 * `true` vuelve a mostrar el selector de motor, el botón «Exportar MP3» y los
 * campos de API key en Ajustes. El código de `src/main/tts/remote.ts`,
 * `src/main/tts/exportMp3.ts` y `src/renderer/src/lib/remoteTts.ts` (y sus
 * canales IPC) sigue intacto y probado; esto es solo la puerta de la UI.
 */
export const REMOTE_TTS_ENABLED = false
