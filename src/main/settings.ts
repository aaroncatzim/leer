/**
 * Ajustes persistentes (brief §5.7). Dos ficheros en `userData`:
 *   - `settings.json`  — ajustes no sensibles (motor, voz, chunk, idioma OCR).
 *   - `secrets.bin`    — API keys cifradas con `safeStorage` (brief §3).
 *
 * Las keys NUNCA se devuelven al renderer en texto plano: solo un booleano
 * "configurada" y una pista enmascarada.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

export type OcrLang = 'spa' | 'spa+eng'

export interface AppSettings {
  engine: 'system' | 'elevenlabs' | 'openai'
  voiceId: string | null
  rate: number
  /** Máx. de caracteres por chunk para el motor remoto (brief §5.4). */
  chunkChars: number
  ocrLang: OcrLang
}

const DEFAULTS: AppSettings = {
  engine: 'system',
  voiceId: null,
  rate: 1,
  chunkChars: 3000,
  ocrLang: 'spa'
}

export type SecretProvider = 'elevenlabs' | 'openai'

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')
const secretsFile = (): string => join(app.getPath('userData'), 'secrets.bin')
export const ttsCacheDir = (): string => join(app.getPath('userData'), 'tts-cache')

export function readSettings(): AppSettings {
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), 'utf8')) as Partial<AppSettings>
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...readSettings(), ...patch }
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2))
  return next
}

// ── Secretos ─────────────────────────────────────────────────────────

function readSecrets(): Partial<Record<SecretProvider, string>> {
  try {
    if (!existsSync(secretsFile()) || !safeStorage.isEncryptionAvailable()) return {}
    const plain = safeStorage.decryptString(readFileSync(secretsFile()))
    return JSON.parse(plain) as Partial<Record<SecretProvider, string>>
  } catch {
    return {}
  }
}

function writeSecrets(secrets: Partial<Record<SecretProvider, string>>): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('El cifrado seguro no está disponible en este sistema.')
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(secrets))
  writeFileSync(secretsFile(), encrypted)
}

/** Uso interno del main (síntesis). No se expone al renderer. */
export function getSecret(provider: SecretProvider): string | null {
  return readSecrets()[provider] ?? null
}

export function setSecret(provider: SecretProvider, key: string): void {
  const secrets = readSecrets()
  const trimmed = key.trim()
  if (trimmed) secrets[provider] = trimmed
  else delete secrets[provider]
  writeSecrets(secrets)
}

export function clearSecret(provider: SecretProvider): void {
  const secrets = readSecrets()
  delete secrets[provider]
  writeSecrets(secrets)
}

/** Pista enmascarada para la UI: `••••••1a2b`. `null` si no hay key. */
export function secretHint(provider: SecretProvider): string | null {
  const key = getSecret(provider)
  if (!key) return null
  return key.length <= 4 ? '••••' : `••••••${key.slice(-4)}`
}

export function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

// ── Caché de audio ───────────────────────────────────────────────────

export async function cacheSizeBytes(): Promise<number> {
  try {
    const files = await readdir(ttsCacheDir())
    let total = 0
    for (const f of files) {
      total += (await stat(join(ttsCacheDir(), f))).size
    }
    return total
  } catch {
    return 0
  }
}

export function clearCache(): void {
  try {
    rmSync(ttsCacheDir(), { recursive: true, force: true })
    mkdirSync(ttsCacheDir(), { recursive: true })
  } catch {
    /* nada que borrar */
  }
}

export function ensureCacheDir(): void {
  try {
    if (!existsSync(ttsCacheDir())) mkdirSync(ttsCacheDir(), { recursive: true })
  } catch {
    /* se reintenta al escribir */
  }
}

/** Tamaño de un fichero de caché, 0 si no existe. */
export function fileSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}
