/**
 * Proveedores de texto a voz (brief §5.5). Interfaz única para los tres
 * motores; en este hito solo existe `system` (offline, `window.speechSynthesis`).
 * Los motores remotos (ElevenLabs / OpenAI) se añadirán como implementaciones
 * de `TtsProvider` que hablan con el proceso principal por IPC.
 */

export interface Voice {
  id: string
  label: string
  lang: string
  local: boolean
}

export interface SpeakOptions {
  voiceId: string | null
  /** 0.5–2.0 */
  rate: number
}

export interface TtsProvider {
  readonly id: 'system' | 'elevenlabs' | 'openai'
  readonly canExport: boolean
  listVoices(): Promise<Voice[]>
  /**
   * Habla un fragmento (un párrafo). Resuelve al terminar o cuando se cancela
   * de forma deliberada; rechaza solo ante un fallo real.
   */
  speak(text: string, opts: SpeakOptions): Promise<void>
  pause(): void
  resume(): void
  stop(): void
  /**
   * Resaltado por palabra si el motor lo soporta. `charIndex` es el offset en
   * caracteres dentro del texto pasado a `speak`. Devuelve la baja.
   */
  onBoundary(cb: (charIndex: number) => void): () => void
  /** Calienta la caché del siguiente fragmento sin reproducirlo (motor remoto). */
  prefetch?(text: string, opts: SpeakOptions): void
  /** Notifica caracteres facturados a la API (motor remoto). Devuelve la baja. */
  onChars?(cb: (chars: number) => void): () => void
}

export function clampRate(r: number): number {
  return Math.min(2, Math.max(0.5, Number.isFinite(r) ? r : 1))
}

export class SystemTtsProvider implements TtsProvider {
  readonly id = 'system' as const
  readonly canExport = false

  private synth = window.speechSynthesis
  private boundaryCbs = new Set<(charIndex: number) => void>()
  private currentUtterance: SpeechSynthesisUtterance | null = null

  async listVoices(): Promise<Voice[]> {
    const read = (): Voice[] =>
      this.synth.getVoices().map((v) => ({
        id: v.voiceURI,
        label: v.name,
        lang: v.lang,
        local: v.localService
      }))

    let voices = read()
    if (voices.length === 0) {
      // Chromium puebla las voces de forma asíncrona.
      voices = await new Promise<Voice[]>((resolve) => {
        let settled = false
        const finish = (): void => {
          if (settled) return
          settled = true
          this.synth.removeEventListener('voiceschanged', finish)
          resolve(read())
        }
        this.synth.addEventListener('voiceschanged', finish)
        setTimeout(finish, 2000)
      })
    }

    const esFirst = (lang: string): number => (lang.toLowerCase().startsWith('es') ? 0 : 1)
    return voices.sort(
      (a, b) => esFirst(a.lang) - esFirst(b.lang) || a.label.localeCompare(b.label, 'es')
    )
  }

  speak(text: string, opts: SpeakOptions): Promise<void> {
    this.stop()
    return new Promise<void>((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(text)
      u.rate = clampRate(opts.rate)
      if (opts.voiceId) {
        const match = this.synth.getVoices().find((v) => v.voiceURI === opts.voiceId)
        if (match) {
          u.voice = match
          u.lang = match.lang
        }
      }
      u.onboundary = (e): void => {
        if (e.name === 'word' || !e.name) {
          for (const cb of this.boundaryCbs) cb(e.charIndex)
        }
      }
      u.onend = (): void => {
        if (this.currentUtterance === u) this.currentUtterance = null
        resolve()
      }
      u.onerror = (e): void => {
        if (this.currentUtterance === u) this.currentUtterance = null
        // `interrupted` / `canceled` = un stop() deliberado, no un fallo.
        if (e.error === 'interrupted' || e.error === 'canceled') resolve()
        else reject(new Error(`speechSynthesis: ${e.error}`))
      }
      this.currentUtterance = u
      this.synth.speak(u)
      // TODO(brief §9): Chromium puede cortar utterances largas (~15 s). El
      // troceado por párrafo lo mitiga; si aún así corta, evaluar el hack
      // pause()/resume() periódico (verificar comportamiento actual antes).
    })
  }

  pause(): void {
    if (this.synth.speaking && !this.synth.paused) this.synth.pause()
  }

  resume(): void {
    if (this.synth.paused) this.synth.resume()
  }

  stop(): void {
    this.currentUtterance = null
    this.synth.cancel()
  }

  onBoundary(cb: (charIndex: number) => void): () => void {
    this.boundaryCbs.add(cb)
    return () => {
      this.boundaryCbs.delete(cb)
    }
  }
}
