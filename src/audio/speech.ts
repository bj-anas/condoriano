/**
 * Thin wrappers around the browser Web Speech API (speech recognition + speech synthesis).
 * Used by the wake word and by the turn-based fallback engine.
 */

export interface RecognitionAlternative {
  transcript: string
  confidence: number
}

export interface RecognitionResult {
  isFinal: boolean
  0: RecognitionAlternative
  length: number
}

export interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}

export interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onspeechstart: (() => void) | null
}

type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechRecognitionSupported = (): boolean => recognitionCtor() !== null

/** iPhone and iPad, including iPadOS which reports itself as a Mac with a touch screen. */
export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** A plain-language explanation for a speech recognition error code. */
export function recognitionErrorMessage(code: string): string {
  switch (code) {
    case 'service-not-allowed':
      return isIOS()
        ? 'Speech recognition is off on this device. Turn on Dictation in iOS Settings → General → Keyboard, or use Gemini Live (it does not need it).'
        : 'This browser blocked its speech service. Use Chrome or Edge, or use Gemini Live (it does not need it).'
    case 'not-allowed':
      return 'Microphone or speech recognition access was denied. Allow it for this site in the browser settings.'
    case 'audio-capture':
      return 'No microphone was found.'
    case 'network':
      return 'Speech recognition needs an internet connection.'
    default:
      return `Speech recognition failed (${code}).`
  }
}

export function createRecognition(lang = 'en-US'): Recognition {
  const Ctor = recognitionCtor()
  if (!Ctor) throw new Error('Speech recognition is not supported in this browser. Use Chrome or Edge.')
  const rec = new Ctor()
  rec.lang = lang
  rec.maxAlternatives = 1
  return rec
}

/** Errors that mean "stop trying", as opposed to a normal timeout we restart after. */
export const FATAL_RECOGNITION_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])

export function englishVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return []
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
}

/**
 * Speaks text sentence by sentence (Chrome cuts long utterances off after ~15 s).
 * Resolves when everything was spoken or `cancelSpeech()` was called.
 */
export function speak(text: string, voiceURI: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    speechSynthesis.cancel()
    const voice = speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI) ?? englishVoices()[0]
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]
    let remaining = sentences.length
    const done = () => {
      if (--remaining <= 0) resolve()
    }
    for (const sentence of sentences) {
      const u = new SpeechSynthesisUtterance(sentence.trim())
      if (voice) u.voice = voice
      u.lang = voice?.lang ?? 'en-US'
      u.onend = done
      u.onerror = () => {
        remaining = 0
        resolve()
      }
      speechSynthesis.speak(u)
    }
  })
}

export function cancelSpeech(): void {
  if ('speechSynthesis' in window) speechSynthesis.cancel()
}
