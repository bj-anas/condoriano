import { Microphone } from '../audio/microphone'
import { resumeAudio } from '../audio/context'
import { FATAL_RECOGNITION_ERRORS, cancelSpeech, createRecognition, isIOS, recognitionErrorMessage, speak } from '../audio/speech'
import { log } from '../stores/diag'
import { scheduleQuotaRefresh } from '../stores/quota'
import type { Recognition } from '../audio/speech'
import { getKnowledgeBase } from '../knowledge'
import { AiError, toAiError } from './errors'
import { geminiComplete } from './providers/gemini-rest'
import { groqComplete } from './providers/groq'
import type { CallState, ChatTurn, EngineContext, ModelOption, VoiceEngine } from './types'

const MAX_HISTORY = 20
const SCREENSHOT_PROMPT = 'I just shared a screenshot of my game. What does it show?'

const TURN_MODE_NOTE = `
KNOWLEDGE IN THIS MODE
- The knowledge search runs automatically. Its results are attached to each player message under KNOWLEDGE RESULTS. Treat them exactly like search_bdo_knowledge tool results.`

const NO_WEB_SEARCH_NOTE = `
- Web search is not available with this model. If the knowledge results don't answer the question, say you don't have that information yet and suggest switching to a Gemini model to search the web.`

export interface TurnEngineOptions {
  keys: { gemini: string; groq: string }
  browserVoice: string
  /** Picks the model for one question (Auto routing). Returns null when nothing is left. */
  pickModel: (question: { text: string; hasImage: boolean }) => ModelOption | null
  /** Called when a model hits its limit; the engine then retries with the next pick. */
  onQuota: (model: ModelOption, error: AiError) => void
}

/** Turn-based voice: browser speech recognition → text model → browser speech synthesis. */
export class TurnEngine implements VoiceEngine {
  readonly kind = 'turn' as const
  currentModel: ModelOption
  private mic = new Microphone()
  private recognition: Recognition | null = null
  private levelTimer: ReturnType<typeof setInterval> | undefined
  private history: ChatTurn[]
  private pendingImage: string | null = null
  private abort: AbortController | null = null
  private listening = false
  /** iOS Safari only starts speech recognition from a tap, so each turn waits for one. */
  private readonly tapToTalk = isIOS()
  private busy = false
  private ended = false
  private state: CallState = 'idle'
  private opts: TurnEngineOptions
  private ctx: EngineContext

  constructor(initialModel: ModelOption, opts: TurnEngineOptions, ctx: EngineContext) {
    this.currentModel = initialModel
    this.opts = opts
    this.ctx = ctx
    this.history = [...ctx.history]
  }

  async start(): Promise<void> {
    this.setState('connecting')
    if (isIOS()) {
      // iPhone/iPad: only one thing can hold the mic. Safari's speech recognition needs it, and
      // recording mode also mutes the browser voice, so we don't open it ourselves. A steady
      // "silence" tick keeps the silence hang-up working; recognition results count as speech.
      log('turn: iOS, leaving the mic to Safari speech recognition')
      this.levelTimer = setInterval(() => this.ctx.events.onMicLevel(0), 100)
    } else {
      await this.mic.start()
      await resumeAudio()
      this.mic.onChunk = ({ rms }) => this.ctx.events.onMicLevel(rms)
    }
    this.recognition = createRecognition('en-US')
    this.recognition.continuous = true
    this.recognition.interimResults = true
    this.recognition.onresult = (e) => {
      if (this.busy) return
      this.ctx.events.onMicLevel(1)
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const text = result[0].transcript.trim()
        if (!text) continue
        if (result.isFinal) void this.ask(text, null)
        else interim += `${text} `
      }
      if (interim) this.ctx.events.onTranscript('user', interim.trim(), false)
    }
    this.recognition.onerror = (e) => {
      if (FATAL_RECOGNITION_ERRORS.has(e.error)) {
        this.listening = false
        this.ctx.events.onError(new AiError('unknown', recognitionErrorMessage(e.error)), this.currentModel)
      }
    }
    // Chrome ends continuous recognition after a while; restart it while we should be listening.
    this.recognition.onend = () => {
      if (!this.listening || this.ended) return
      if (this.tapToTalk) {
        // Safari stopped listening (pause, no speech); restarting needs another tap.
        this.listening = false
        this.ctx.events.onTapToTalk(true)
      } else {
        this.startRecognition()
      }
    }

    const greeting = this.ctx.history.length ? 'I switched to a backup model. Go ahead.' : this.ctx.greeting
    await this.say(greeting)
    if (!this.ctx.history.length) this.remember({ role: 'assistant', text: greeting })
    this.listen()
  }

  sendImage(jpegBase64: string): void {
    if (this.busy) {
      this.pendingImage = jpegBase64
      return
    }
    void this.ask(SCREENSHOT_PROMPT, jpegBase64)
  }

  stopSpeaking(): void {
    this.abort?.abort()
    cancelSpeech()
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    this.listening = false
    this.abort?.abort()
    cancelSpeech()
    this.recognition?.abort()
    clearInterval(this.levelTimer)
    this.mic.stop()
    this.setState('idle')
  }

  inputLevel(): number {
    return this.mic.level()
  }

  outputLevel(): number {
    // Browser speech synthesis has no level output; the orb pulses on its own while speaking.
    return this.state === 'speaking' ? 0.08 : 0
  }

  private setState(state: CallState): void {
    if (this.ended && state !== 'idle') return
    if (state === this.state) return
    this.state = state
    this.ctx.events.onState(state)
  }

  private startRecognition(): void {
    if (this.ended) return
    try {
      this.recognition?.start()
    } catch {
      // already started
    }
  }

  private listen(): void {
    if (this.ended) return
    this.busy = false
    this.setState('listening')
    // Going back to listening can end the call (after "bye"), so check again.
    if (this.ended) return
    if (this.pendingImage) {
      const image = this.pendingImage
      this.pendingImage = null
      void this.ask(SCREENSHOT_PROMPT, image)
      return
    }
    if (this.tapToTalk) {
      this.ctx.events.onTapToTalk(true)
      return
    }
    this.listening = true
    this.startRecognition()
  }

  /** iOS: called from the "Tap to talk" button, inside the tap, which Safari requires. */
  talk(): void {
    if (!this.tapToTalk || this.busy || this.ended || this.listening) return
    this.ctx.events.onTapToTalk(false)
    this.listening = true
    log('turn: tap to talk, listening')
    this.startRecognition()
  }

  /** Stop listening while Condoriano thinks and talks, so it never hears itself. */
  private pauseListening(): void {
    this.listening = false
    this.ctx.events.onTapToTalk(false)
    this.recognition?.abort()
  }

  private async ask(text: string, image: string | null): Promise<void> {
    if (this.busy || this.ended) return
    this.busy = true
    this.pauseListening()
    this.ctx.events.onTranscript('user', text, true)
    this.setState('thinking')

    const knowledge = getKnowledgeBase().toolResult(text)
    const question: ChatTurn = {
      role: 'user',
      text: `${text}\n\nKNOWLEDGE RESULTS\n${JSON.stringify(knowledge)}`,
      image: image ?? undefined,
    }

    const reply = await this.complete(question, text, !!image)
    if (this.ended) return
    this.remember({ role: 'user', text: image ? `${text} [screenshot]` : text })
    if (reply) {
      this.remember({ role: 'assistant', text: reply })
      this.ctx.events.onTranscript('assistant', reply, true)
      await this.say(reply)
    }
    this.listen()
  }

  private async complete(question: ChatTurn, text: string, hasImage: boolean): Promise<string | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const model = this.opts.pickModel({ text, hasImage })
      if (!model) return null
      this.currentModel = model
      this.abort = new AbortController()
      try {
        const reply = await this.callModel(model, question)
        if (model.provider === 'gemini') scheduleQuotaRefresh()
        return reply
      } catch (err) {
        if ((err as Error).name === 'AbortError') return null
        const error = toAiError(err)
        if (error.kind === 'quota') {
          this.opts.onQuota(model, error)
          continue
        }
        this.ctx.events.onError(error, model)
        return null
      } finally {
        this.abort = null
      }
    }
    return null
  }

  private callModel(model: ModelOption, question: ChatTurn): Promise<string> {
    const request = {
      model: model.apiModel,
      system: this.ctx.systemPrompt + TURN_MODE_NOTE,
      history: [...this.history, question],
      signal: this.abort?.signal,
    }
    if (model.provider === 'groq') {
      if (!this.opts.keys.groq) throw new AiError('auth', 'Add a Groq key in Settings to use Groq models.')
      return groqComplete({
        apiKey: this.opts.keys.groq,
        ...request,
        system: request.system + NO_WEB_SEARCH_NOTE,
      })
    }
    return geminiComplete({ apiKey: this.opts.keys.gemini, ...request, webSearch: true })
  }

  private async say(text: string): Promise<void> {
    this.setState('speaking')
    await speak(toSpeech(text), this.opts.browserVoice)
  }

  private remember(turn: ChatTurn): void {
    this.history.push(turn)
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY)
  }
}

/** Models sometimes add markdown even when told not to; never read symbols aloud. */
function toSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_#`>|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
