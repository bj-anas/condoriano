import { FATAL_RECOGNITION_ERRORS, createRecognition, isIOS, speechRecognitionSupported } from '../audio/speech'
import type { Recognition } from '../audio/speech'
import { matchesWakePhrase } from './match'
import type { WakeSensitivity } from './match'

/**
 * Listens for "Hoy Condoriano" with the browser's speech recognition.
 * Swap this class for Porcupine / openWakeWord later; the rest of the app only calls start/stop.
 */
export class WakeWordListener {
  private rec: Recognition | null = null
  private active = false
  private failures = 0
  private startedAt = 0
  private restartTimer: ReturnType<typeof setTimeout> | undefined
  private sensitivity: WakeSensitivity = 'medium'

  private onWake: () => void
  private onFatal: (error: string) => void

  /**
   * Safari on iPhone/iPad stops recognition after a pause and refuses to restart it without a
   * tap, so an always-on wake word can't work there; calls start with the mic button instead.
   */
  static supported = (): boolean => speechRecognitionSupported() && !isIOS()

  constructor(onWake: () => void, onFatal: (error: string) => void) {
    this.onWake = onWake
    this.onFatal = onFatal
  }

  get running(): boolean {
    return this.active
  }

  start(sensitivity: WakeSensitivity): void {
    this.sensitivity = sensitivity
    if (this.active) return
    this.active = true
    this.failures = 0
    this.launch()
  }

  stop(): void {
    this.active = false
    clearTimeout(this.restartTimer)
    if (this.rec) {
      this.rec.onend = null
      this.rec.abort()
      this.rec = null
    }
  }

  private launch(): void {
    if (!this.active) return
    const rec = createRecognition('en-US')
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (matchesWakePhrase(e.results[i][0].transcript, this.sensitivity)) {
          this.stop()
          this.onWake()
          return
        }
      }
    }
    rec.onerror = (e) => {
      if (FATAL_RECOGNITION_ERRORS.has(e.error)) {
        this.stop()
        this.onFatal(e.error)
      }
    }
    // Recognition stops by itself after silence or network hiccups; restart with backoff.
    rec.onend = () => {
      if (!this.active) return
      this.failures = Date.now() - this.startedAt < 2000 ? this.failures + 1 : 0
      const delay = this.failures ? Math.min(30_000, 500 * 2 ** this.failures) : 100
      this.restartTimer = setTimeout(() => this.launch(), delay)
    }
    this.rec = rec
    this.startedAt = Date.now()
    try {
      rec.start()
    } catch {
      // already running
    }
  }
}
