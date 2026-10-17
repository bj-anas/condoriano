import { computed, reactive, watch } from 'vue'
import type { WakeSensitivity } from '../wake/match'

export interface Settings {
  userName: string
  geminiKey: string
  groqKey: string
  /** `auto` or a model id from MODELS */
  model: string
  liveVoice: string
  /** voiceURI of a browser voice, used by turn-based models; empty = first English voice */
  browserVoice: string
  wakeWordEnabled: boolean
  wakeSensitivity: WakeSensitivity
  /** End the call after this many seconds without speech; 0 = never */
  silenceTimeoutSec: number
  showTranscript: boolean
  /** Only English for now; kept so the prompt's {language} placeholder is ready for Darija. */
  language: 'English'
  watchScreenshotFolder: boolean
  /** Model ids the Gemini key can use, from the key check (empty = unknown) */
  geminiModels: string[]
}

const STORAGE_KEY = 'condoriano.settings.v1'
const SECRET_FIELDS = ['geminiKey', 'groqKey'] as const

const DEFAULTS: Settings = {
  userName: '',
  geminiKey: '',
  groqKey: '',
  model: 'auto',
  liveVoice: 'Puck',
  browserVoice: '',
  wakeWordEnabled: true,
  wakeSensitivity: 'medium',
  silenceTimeoutSec: 10,
  showTranscript: false,
  language: 'English',
  watchScreenshotFolder: false,
  geminiModels: [],
}

function sanitize(input: unknown): Partial<Settings> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    const value = (input as Record<string, unknown>)[key]
    if (value === undefined) continue
    if (Array.isArray(fallback) ? Array.isArray(value) : typeof value === typeof fallback) out[key] = value
  }
  return out as Partial<Settings>
}

/** Bump when a saved setting must be upgraded; see migrate(). */
const SETTINGS_VERSION = 2
const VERSION_KEY = 'condoriano.settings.version'

/** v2: the silence hang-up default went from 60 s to 10 s, so saved old defaults move too. */
function migrate(saved: Partial<Settings>): Partial<Settings> {
  let version = 1
  try {
    version = Number(localStorage.getItem(VERSION_KEY)) || 1
    localStorage.setItem(VERSION_KEY, String(SETTINGS_VERSION))
  } catch {
    return saved
  }
  if (version < 2 && saved.silenceTimeoutSec === 60) saved.silenceTimeoutSec = 10
  return saved
}

function load(): Settings {
  try {
    return { ...DEFAULTS, ...migrate(sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'))) }
  } catch {
    return { ...DEFAULTS }
  }
}

export const settings = reactive<Settings>(load())

watch(
  settings,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      // storage blocked (private mode); settings last for this visit only
    }
  },
  { deep: true, immediate: true },
)

export const isSetUp = computed(() => !!settings.userName.trim() && !!settings.geminiKey.trim())

/** Ask the browser not to evict our storage (the API key lives there). */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => {})
}

export function exportSettings(includeKeys: boolean): string {
  const data: Record<string, unknown> = { ...settings }
  if (!includeKeys) for (const field of SECRET_FIELDS) delete data[field]
  return JSON.stringify({ app: 'condoriano', version: 1, settings: data }, null, 2)
}

/** Returns how many settings were applied. Keys in the file only replace keys if present. */
export function importSettings(json: string): number {
  const parsed = JSON.parse(json) as { app?: string; settings?: unknown }
  if (parsed.app !== 'condoriano') throw new Error('This is not a Condoriano settings file.')
  const values = sanitize(parsed.settings)
  Object.assign(settings, values)
  return Object.keys(values).length
}

export function resetSettings(): void {
  Object.assign(settings, { ...DEFAULTS, geminiModels: [] })
}
