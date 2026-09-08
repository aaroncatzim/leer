/**
 * Motor TTS remoto (brief §5.5, §5.6). En este paso, ElevenLabs.
 * El renderer nunca ve la API key ni sale a la red: pide `tts:synthesize` y el
 * main comprueba la caché en disco, llama a la API si falta, guarda el mp3 y
 * devuelve los bytes. Contador de caracteres enviados a la API.
 *
 * Endpoints y parámetros según la documentación vigente de ElevenLabs
 * (`POST /v1/text-to-speech/{voice_id}`, header `xi-api-key`, respuesta
 * `audio/mpeg`, modelo por defecto `eleven_multilingual_v2`). No hardcodeados
 * "de memoria": verificados al implementar.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RemoteVoice } from '../../shared/ipc'
import { ensureCacheDir, getSecret, ttsCacheDir } from '../settings'

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'
const DEFAULT_MODEL = 'eleven_multilingual_v2'
/** ElevenLabs limita `voice_settings.speed` a ~0.7–1.2. */
const clampSpeed = (r: number): number => Math.min(1.2, Math.max(0.7, Number.isFinite(r) ? r : 1))

let sessionChars = 0
export const sessionCharCount = (): number => sessionChars

export interface SynthParams {
  provider: 'elevenlabs' | 'openai'
  voiceId: string
  text: string
  /** Velocidad del reproductor (0.5–2.0); se adapta al rango del proveedor. */
  speed: number
  modelId?: string
}

export interface SynthResult {
  bytes: ArrayBuffer
  cached: boolean
  chars: number
}

function cacheKey(p: SynthParams): string {
  const model = p.modelId ?? DEFAULT_MODEL
  return createHash('sha256')
    .update(`${p.provider}|${p.voiceId}|${model}|${clampSpeed(p.speed)}|${p.text}`)
    .digest('hex')
}

export async function listRemoteVoices(provider: 'elevenlabs' | 'openai'): Promise<RemoteVoice[]> {
  if (provider === 'openai') throw new Error('OpenAI TTS llega en el paso 7.')
  const key = getSecret('elevenlabs')
  if (!key) throw new Error('Configura la API key de ElevenLabs en Ajustes.')

  let res: Response
  try {
    res = await fetch(`${ELEVENLABS_BASE}/voices`, {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(15000)
    })
  } catch (err) {
    throw new Error(offlineMessage(err))
  }
  if (res.status === 401) throw new Error('La API key de ElevenLabs no es válida.')
  if (!res.ok) throw new Error(`ElevenLabs respondió ${res.status}.`)

  const body = (await res.json()) as { voices?: { voice_id: string; name: string; labels?: Record<string, string> }[] }
  return (body.voices ?? []).map((v) => ({
    id: v.voice_id,
    label: v.name,
    lang: v.labels?.language ?? 'multi'
  }))
}

export async function synthesize(params: SynthParams): Promise<SynthResult> {
  if (params.provider === 'openai') throw new Error('OpenAI TTS llega en el paso 7.')
  ensureCacheDir()

  const file = join(ttsCacheDir(), `${cacheKey(params)}.mp3`)
  if (existsSync(file)) {
    const buf = readFileSync(file)
    return { bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), cached: true, chars: 0 }
  }

  const key = getSecret('elevenlabs')
  if (!key) throw new Error('Configura la API key de ElevenLabs en Ajustes.')

  let res: Response
  try {
    res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(params.voiceId)}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: params.text,
        model_id: params.modelId ?? DEFAULT_MODEL,
        voice_settings: { speed: clampSpeed(params.speed) }
      }),
      signal: AbortSignal.timeout(45000)
    })
  } catch (err) {
    throw new Error(offlineMessage(err))
  }
  if (res.status === 401) throw new Error('La API key de ElevenLabs no es válida.')
  if (res.status === 429) throw new Error('ElevenLabs: límite de uso alcanzado.')
  if (!res.ok) {
    throw new Error(`ElevenLabs respondió ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }

  const bytes = await res.arrayBuffer()
  writeFileSync(file, Buffer.from(bytes))
  sessionChars += params.text.length
  return { bytes, cached: false, chars: params.text.length }
}

function offlineMessage(err: unknown): string {
  const e = err as Error
  if (e.name === 'TimeoutError') return 'La petición al servicio de voz tardó demasiado.'
  return 'Sin conexión con el servicio de voz. Cambia al motor del sistema para seguir escuchando.'
}
