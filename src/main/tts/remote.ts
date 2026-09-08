/**
 * Motores TTS remotos (brief §5.5, §5.6): ElevenLabs y OpenAI.
 * El renderer nunca ve la API key ni sale a la red: pide `tts:synthesize` y el
 * main comprueba la caché en disco, llama a la API si falta, guarda el mp3 y
 * devuelve los bytes. Contador de caracteres enviados.
 *
 * Endpoints y parámetros según la documentación vigente de cada proveedor
 * (verificados al implementar, no "de memoria"):
 *   - ElevenLabs: `POST /v1/text-to-speech/{voice_id}`, header `xi-api-key`,
 *     modelo `eleven_multilingual_v2`, respuesta `audio/mpeg`.
 *   - OpenAI: `POST /v1/audio/speech`, header `Authorization: Bearer …`,
 *     modelo `gpt-4o-mini-tts`, `response_format: "mp3"`.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RemoteProvider, RemoteVoice } from '../../shared/ipc'
import { ensureCacheDir, getSecret, ttsCacheDir } from '../settings'

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'
const ELEVENLABS_MODEL = 'eleven_multilingual_v2'
const OPENAI_BASE = 'https://api.openai.com/v1'
const OPENAI_MODEL = 'gpt-4o-mini-tts'
const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse']

const SECRET_LABEL: Record<RemoteProvider, string> = {
  elevenlabs: 'ElevenLabs',
  openai: 'OpenAI'
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 1))

let sessionChars = 0
export const sessionCharCount = (): number => sessionChars

export interface SynthParams {
  provider: RemoteProvider
  voiceId: string
  text: string
  /** Velocidad del reproductor (0.5–2.0); se adapta al rango del proveedor. */
  speed: number
}

export interface SynthResult {
  bytes: ArrayBuffer
  cached: boolean
  chars: number
}

function modelFor(provider: RemoteProvider): string {
  return provider === 'openai' ? OPENAI_MODEL : ELEVENLABS_MODEL
}

function cacheKey(p: SynthParams): string {
  return createHash('sha256')
    .update(`${p.provider}|${p.voiceId}|${modelFor(p.provider)}|${p.speed.toFixed(2)}|${p.text}`)
    .digest('hex')
}

function requireKey(provider: RemoteProvider): string {
  const key = getSecret(provider)
  if (!key) throw new Error(`Configura la API key de ${SECRET_LABEL[provider]} en Ajustes.`)
  return key
}

function offlineMessage(err: unknown): string {
  const e = err as Error
  if (e.name === 'TimeoutError') return 'La petición al servicio de voz tardó demasiado.'
  return 'Sin conexión con el servicio de voz. Cambia al motor del sistema para seguir escuchando.'
}

export async function listRemoteVoices(provider: RemoteProvider): Promise<RemoteVoice[]> {
  if (provider === 'openai') {
    requireKey('openai') // que falle pronto si no hay key
    return OPENAI_VOICES.map((v) => ({ id: v, label: v[0].toUpperCase() + v.slice(1), lang: 'multi' }))
  }

  const key = requireKey('elevenlabs')
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
  const body = (await res.json()) as {
    voices?: { voice_id: string; name: string; labels?: Record<string, string> }[]
  }
  return (body.voices ?? []).map((v) => ({
    id: v.voice_id,
    label: v.name,
    lang: v.labels?.language ?? 'multi'
  }))
}

async function elevenLabsSpeak(p: SynthParams, key: string): Promise<ArrayBuffer> {
  let res: Response
  try {
    res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(p.voiceId)}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: p.text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: { speed: clamp(p.speed, 0.7, 1.2) }
      }),
      signal: AbortSignal.timeout(45000)
    })
  } catch (err) {
    throw new Error(offlineMessage(err))
  }
  if (res.status === 401) throw new Error('La API key de ElevenLabs no es válida.')
  if (res.status === 429) throw new Error('ElevenLabs: límite de uso alcanzado.')
  if (!res.ok) throw new Error(`ElevenLabs respondió ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.arrayBuffer()
}

async function openaiSpeak(p: SynthParams, key: string): Promise<ArrayBuffer> {
  let res: Response
  try {
    res = await fetch(`${OPENAI_BASE}/audio/speech`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: p.text,
        voice: p.voiceId,
        response_format: 'mp3',
        speed: clamp(p.speed, 0.25, 4)
      }),
      signal: AbortSignal.timeout(45000)
    })
  } catch (err) {
    throw new Error(offlineMessage(err))
  }
  if (res.status === 401) throw new Error('La API key de OpenAI no es válida.')
  if (res.status === 429) throw new Error('OpenAI: límite de uso alcanzado.')
  if (!res.ok) throw new Error(`OpenAI respondió ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.arrayBuffer()
}

/** Sintetiza (o recupera de caché) un texto. Devuelve los bytes mp3. */
export async function synthesize(params: SynthParams): Promise<SynthResult> {
  ensureCacheDir()
  const file = join(ttsCacheDir(), `${cacheKey(params)}.mp3`)
  if (existsSync(file)) {
    const buf = readFileSync(file)
    return {
      bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      cached: true,
      chars: 0
    }
  }

  const key = requireKey(params.provider)
  const bytes =
    params.provider === 'openai'
      ? await openaiSpeak(params, key)
      : await elevenLabsSpeak(params, key)

  writeFileSync(file, Buffer.from(bytes))
  sessionChars += params.text.length
  return { bytes, cached: false, chars: params.text.length }
}
