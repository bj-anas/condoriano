/**
 * The one AI model layer. Everything provider-specific lives behind `VoiceEngine`
 * (see gemini-live.ts and turn-engine.ts), so models can be swapped without touching the UI.
 */

export type Provider = 'gemini' | 'groq'

/** `live`: real-time streaming voice. `turn`: browser speech-to-text → model → browser voice. */
export type EngineKind = 'live' | 'turn'

export interface ModelOption {
  /** Stable id used in settings, e.g. `gemini-3.8-live` or `groq:openai/gpt-oss-20b` */
  id: string
  /** The id sent to the provider's API */
  apiModel: string
  label: string
  provider: Provider
  engine: EngineKind
  supportsImages: boolean
  /** Used by Auto routing: complex questions and screenshots go to `flash`, the rest to `lite`. */
  tier: 'live' | 'flash' | 'lite' | 'fallback'
  description: string
}

export type CallState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'

export type Role = 'user' | 'assistant'

export interface ChatTurn {
  role: Role
  text: string
  /** Base64 JPEG, only on the turn it was shared */
  image?: string
}

export interface EngineEvents {
  onState(state: CallState): void
  /** `final` is false for live partial transcripts that will be extended. */
  onTranscript(role: Role, text: string, final: boolean): void
  /** Mic level roughly every 100 ms; drives the silence timeout and visuals. */
  onMicLevel(rms: number): void
  onError(error: unknown, model: ModelOption): void
  /** The engine stopped on its own (server closed, unrecoverable error). */
  onEnded(reason: string): void
  /** iOS turn mode: true while the engine waits for a tap before it can listen. */
  onTapToTalk(waiting: boolean): void
}

export interface VoiceEngine {
  readonly kind: EngineKind
  /** The model currently answering (turn engines can switch per question in Auto mode). */
  readonly currentModel: ModelOption
  start(): Promise<void>
  sendImage(jpegBase64: string): void
  /** Pause button: stop the current spoken answer immediately. */
  stopSpeaking(): void
  /** iOS turn mode: start listening; must be called directly from a tap. */
  talk?(): void
  end(): void
  inputLevel(): number
  outputLevel(): number
}

export interface EngineContext {
  systemPrompt: string
  /** Spoken (turn engine) or requested (live engine) when the call starts */
  greeting: string
  /** Earlier turns of this call, when the call moves to another model mid-way */
  history: ChatTurn[]
  events: EngineEvents
}
