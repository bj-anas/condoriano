/**
 * Long-lived audio contexts. Browsers only let an AudioContext run after the user has
 * interacted with the page once, so they are created lazily and resumed on every call.
 */
import { isIOS } from './speech'
import { log } from '../stores/diag'

let micContext: AudioContext | null = null
let playbackContext: AudioContext | null = null
/** iOS only: the voice goes out through an <audio> element instead of the context's speakers. */
let outputStream: MediaStreamAudioDestinationNode | null = null
let outputElement: HTMLAudioElement | null = null
const loaded = new WeakMap<AudioContext, Set<string>>()

/** Gemini Live sends 24 kHz audio; the player converts it to the device's own rate. */
export const SOURCE_RATE = 24000

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } }

/**
 * iOS Safari: mark the page as a voice call, so audio plays even with the silent switch on
 * and the mic and speaker can run together. Ignored by browsers without the API.
 */
export function useVoiceCallAudioSession(): void {
  const session = (navigator as AudioSessionNavigator).audioSession
  if (session) session.type = 'play-and-record'
  log(`audioSession: ${session ? session.type : 'not supported'}`)
}

/** Resumes a context that is `suspended`, or `interrupted` (iOS, e.g. when the mic starts). */
async function wake(ctx: AudioContext): Promise<void> {
  if (ctx.state !== 'running') await ctx.resume().catch(() => {})
}

function create(label: string): AudioContext {
  const ctx = new AudioContext({ latencyHint: 'interactive' })
  log(`${label} context: ${ctx.sampleRate} Hz, ${ctx.state}`)
  // iOS can interrupt audio at any time (mic starting, other apps); try to come back.
  ctx.addEventListener('statechange', () => {
    log(`${label} context → ${ctx.state}`)
    if ((ctx.state as string) === 'interrupted') void wake(ctx)
  })
  return ctx
}

/**
 * On iPhone/iPad, Web Audio played straight to the speakers can go silent (or to the earpiece)
 * once the mic is open. Media elements get normal loudspeaker playback, so on iOS the voice is
 * piped context → MediaStream → <audio>. play() must run inside the user's tap, which is why
 * this is called synchronously from unlockAudio().
 */
function ensureOutputElement(ctx: AudioContext): void {
  if (!isIOS()) return
  outputStream ??= ctx.createMediaStreamDestination()
  if (!outputElement) {
    outputElement = document.createElement('audio')
    outputElement.setAttribute('playsinline', '')
    outputElement.autoplay = true
    outputElement.srcObject = outputStream.stream
    outputElement.style.display = 'none'
    document.body.append(outputElement)
  }
  if (!outputElement.paused) return
  outputElement
    .play()
    .then(() => log('audio element: playing'))
    .catch((err: Error) => log(`audio element: play() failed, ${err.name}`))
}

/** Where the voice player connects: the <audio> route on iOS, the speakers elsewhere. */
export function voiceOutput(ctx: AudioContext): AudioNode {
  return outputStream && isIOS() ? outputStream : ctx.destination
}

export function workletUrl(name: string): string {
  return `${import.meta.env.BASE_URL}worklets/${name}`
}

async function ensureModule(ctx: AudioContext, name: string): Promise<void> {
  let set = loaded.get(ctx)
  if (!set) loaded.set(ctx, (set = new Set()))
  if (set.has(name)) return
  await ctx.audioWorklet.addModule(workletUrl(name))
  set.add(name)
}

export async function getMicContext(): Promise<AudioContext> {
  micContext ??= create('mic')
  await wake(micContext)
  await ensureModule(micContext, 'capture.js')
  return micContext
}

export async function getPlaybackContext(): Promise<AudioContext> {
  playbackContext ??= create('playback')
  ensureOutputElement(playbackContext)
  await wake(playbackContext)
  await ensureModule(playbackContext, 'player.js')
  return playbackContext
}

/** Wakes both contexts again; called after the mic starts, which can interrupt playback on iOS. */
export async function resumeAudio(): Promise<void> {
  await Promise.all([micContext, playbackContext].map((ctx) => (ctx ? wake(ctx) : undefined)))
  if (outputElement?.paused) {
    await outputElement.play().catch((err: Error) => log(`audio element: resume failed, ${err.name}`))
  }
  log(`after mic: mic ${micContext?.state}, playback ${playbackContext?.state}, element ${outputElement ? (outputElement.paused ? 'paused' : 'playing') : 'none'}`)
}

/** Call from a click/keydown handler so later wake-word calls can start audio without one. */
export function unlockAudio(): void {
  void getMicContext().catch(() => {})
  void getPlaybackContext().catch(() => {})
}

export function hasUserActivation(): boolean {
  return navigator.userActivation?.hasBeenActive ?? true
}

export function rmsOf(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer)
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / buffer.length)
}
