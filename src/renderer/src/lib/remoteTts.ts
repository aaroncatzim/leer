import type { RemoteProvider } from '@shared/ipc'
import type { SpeakOptions, TtsProvider, Voice } from './tts'

/**
 * Motor TTS remoto (ElevenLabs u OpenAI). El renderer nunca ve la API key ni
 * sale a la red: pide `window.api.synthesize`, el main resuelve caché/API y
 * devuelve los bytes mp3, que se reproducen con `<audio>` sobre un blob URL
 * (`media-src blob:` en la CSP). Resaltado solo por párrafo (brief §2).
 */
export class RemoteTtsProvider implements TtsProvider {
  readonly id: RemoteProvider
  readonly canExport = true

  private audio: HTMLAudioElement | null = null
  private url: string | null = null
  private charsCbs = new Set<(chars: number) => void>()

  constructor(provider: RemoteProvider) {
    this.id = provider
  }

  async listVoices(): Promise<Voice[]> {
    const voices = await window.api.listRemoteVoices(this.id)
    return voices.map((v) => ({ id: v.id, label: v.label, lang: v.lang, local: false }))
  }

  async speak(text: string, opts: SpeakOptions): Promise<void> {
    this.stop()
    if (!opts.voiceId) throw new Error('Elige una voz.')

    const { bytes, chars } = await window.api.synthesize({
      provider: this.id,
      voiceId: opts.voiceId,
      text,
      speed: opts.rate
    })
    if (chars > 0) for (const cb of this.charsCbs) cb(chars)

    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
    this.url = url
    const audio = new Audio(url)
    this.audio = audio

    return new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        this.release()
        resolve()
      }
      audio.onerror = () => {
        this.release()
        reject(new Error('No se pudo reproducir el audio recibido.'))
      }
      audio.play().catch(reject)
    })
  }

  prefetch(text: string, opts: SpeakOptions): void {
    if (!opts.voiceId) return
    void window.api
      .synthesize({ provider: this.id, voiceId: opts.voiceId, text, speed: opts.rate })
      .catch(() => undefined)
  }

  pause(): void {
    this.audio?.pause()
  }

  resume(): void {
    void this.audio?.play()
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause()
      this.audio.onended = null
      this.audio.onerror = null
      this.audio.src = ''
    }
    this.audio = null
    this.release()
  }

  onBoundary(): () => void {
    return () => undefined
  }

  onChars(cb: (chars: number) => void): () => void {
    this.charsCbs.add(cb)
    return () => {
      this.charsCbs.delete(cb)
    }
  }

  private release(): void {
    if (this.url) {
      URL.revokeObjectURL(this.url)
      this.url = null
    }
  }
}
