/**
 * Long-lived audio contexts. Browsers only let an AudioContext run after the user has
 * interacted with the page once, so they are created lazily and resumed on every call.
 */
let micContext: AudioContext | null = null
let playbackContext: AudioContext | null = null
const loaded = new WeakMap<AudioContext, Set<string>>()

export const PLAYBACK_RATE = 24000

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
  micContext ??= new AudioContext({ latencyHint: 'interactive' })
  if (micContext.state === 'suspended') await micContext.resume()
  await ensureModule(micContext, 'capture.js')
  return micContext
}

export async function getPlaybackContext(): Promise<AudioContext> {
  playbackContext ??= new AudioContext({ sampleRate: PLAYBACK_RATE, latencyHint: 'interactive' })
  if (playbackContext.state === 'suspended') await playbackContext.resume()
  await ensureModule(playbackContext, 'player.js')
  return playbackContext
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
