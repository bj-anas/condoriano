import { GoogleGenAI, Modality, Type } from '@google/genai'
import type { FunctionCall, FunctionResponse, LiveServerMessage, Session } from '@google/genai'
import { Microphone } from '../audio/microphone'
import { VoicePlayer } from '../audio/player'
import { base64ToBytes, bytesToBase64 } from '../audio/encoding'
import { getKnowledgeBase } from '../knowledge'
import { AiError, fromLiveClose, toAiError } from './errors'
import type { CallState, EngineContext, ModelOption, VoiceEngine } from './types'

const CONNECT_TIMEOUT_MS = 15_000

export const SEARCH_TOOL = {
  name: 'search_bdo_knowledge',
  description:
    'Searches the Black Desert Online knowledge base. Use it for every game question. ' +
    'Pass the player question with game terms as the query, using specific item names ' +
    '(for example "black stone" or "Caphras Stone", not just "stone").',
}

export class GeminiLiveEngine implements VoiceEngine {
  readonly kind = 'live' as const
  private ai: GoogleGenAI
  private session: Session | null = null
  private mic = new Microphone()
  private player = new VoicePlayer()
  /** Bumped on every (re)connect and on end, so callbacks from old sockets are ignored. */
  private generation = 0
  private ended = false
  private reconnecting = false
  private resumeHandle: string | undefined
  private toolPending = false
  /** Set by the Pause button: drop the rest of the current answer. */
  private dropAudio = false
  private turnDone = true
  private userText = ''
  private assistantText = ''
  private state: CallState = 'idle'
  readonly currentModel: ModelOption
  private voice: string
  private ctx: EngineContext

  constructor(apiKey: string, model: ModelOption, voice: string, ctx: EngineContext) {
    this.ai = new GoogleGenAI({ apiKey })
    this.currentModel = model
    this.voice = voice
    this.ctx = ctx
  }

  async start(): Promise<void> {
    this.setState('connecting')
    await this.player.start()
    this.player.onPlayingChange = (playing) => {
      if (playing) this.setState('speaking')
      else this.setState(this.turnDone ? 'listening' : 'thinking')
    }
    await this.mic.start()
    this.mic.onChunk = ({ pcm, rms }) => {
      this.ctx.events.onMicLevel(rms)
      if (!this.session || this.toolPending || this.reconnecting) return
      this.session.sendRealtimeInput({
        audio: { data: bytesToBase64(new Uint8Array(pcm)), mimeType: 'audio/pcm;rate=16000' },
      })
    }

    this.session = await this.connect()
    this.setState('listening')
    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: this.ctx.greeting }] }],
      turnComplete: true,
    })
  }

  sendImage(jpegBase64: string): void {
    if (!this.session) return
    this.session.sendRealtimeInput({ video: { data: jpegBase64, mimeType: 'image/jpeg' } })
    this.session.sendRealtimeInput({
      text:
        '[The player just shared a screenshot of their game. Say what screen it shows in one ' +
        'sentence, then answer their question about it or ask what they need.]',
    })
  }

  stopSpeaking(): void {
    this.player.flush()
    if (!this.turnDone) this.dropAudio = true
    this.finishAssistantText()
    this.turnDone = true
    this.setState('listening')
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    this.generation++
    this.session?.close()
    this.session = null
    this.mic.stop()
    this.player.stop()
    this.setState('idle')
  }

  inputLevel(): number {
    return this.mic.level()
  }

  outputLevel(): number {
    return this.player.level()
  }

  private setState(state: CallState): void {
    if (this.ended && state !== 'idle') return
    if (state === this.state) return
    this.state = state
    this.ctx.events.onState(state)
  }

  /**
   * The SDK's connect() only resolves after `setupComplete`, and never settles if the server
   * closes first (bad key, quota, unsupported model). So we race it against onclose and a timeout.
   */
  private connect(): Promise<Session> {
    const generation = ++this.generation
    return new Promise<Session>((resolve, reject) => {
      let settled = false
      const fail = (err: AiError) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(err)
      }
      const timer = setTimeout(
        () => fail(new AiError('network', 'Gemini Live did not answer in time. Check your connection.')),
        CONNECT_TIMEOUT_MS,
      )

      this.ai.live
        .connect({
          model: this.currentModel.apiModel,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } },
            systemInstruction: this.ctx.systemPrompt,
            tools: [
              {
                functionDeclarations: [
                  {
                    ...SEARCH_TOOL,
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        query: { type: Type.STRING, description: 'What to look up, in English' },
                      },
                      required: ['query'],
                    },
                  },
                ],
              },
              // Web search, used only after the player agrees (see skill.md).
              { googleSearch: {} },
            ],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            contextWindowCompression: { slidingWindow: {} },
            sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
          },
          callbacks: {
            onmessage: (msg) => {
              if (generation === this.generation) this.handleMessage(msg)
            },
            onclose: (e) => {
              if (!settled) fail(fromLiveClose(e.code, e.reason))
              else if (generation === this.generation) this.handleClose(e)
            },
          },
        })
        .then((session) => {
          if (settled) {
            session.close()
            return
          }
          settled = true
          clearTimeout(timer)
          resolve(session)
        })
        .catch((err: unknown) => fail(toAiError(err)))
    })
  }

  /** Connections last about 10 minutes; `goAway` warns us, and the resume handle keeps context. */
  private async reconnect(): Promise<void> {
    if (this.reconnecting || this.ended) return
    this.reconnecting = true
    const old = this.session
    try {
      this.session = await this.connect()
      old?.close()
    } catch (err) {
      this.ctx.events.onError(err, this.currentModel)
    } finally {
      this.reconnecting = false
    }
  }

  private handleClose(e: CloseEvent): void {
    if (this.ended || this.reconnecting) return
    if (e.code === 1000 && this.resumeHandle) {
      void this.reconnect()
      return
    }
    this.session = null
    if (e.code === 1000) this.ctx.events.onEnded('The session ended.')
    else this.ctx.events.onError(fromLiveClose(e.code, e.reason), this.currentModel)
  }

  private handleMessage(msg: LiveServerMessage): void {
    const update = msg.sessionResumptionUpdate
    if (update?.resumable && update.newHandle) this.resumeHandle = update.newHandle
    if (msg.goAway) void this.reconnect()
    if (msg.toolCall?.functionCalls?.length) this.answerToolCalls(msg.toolCall.functionCalls)

    const content = msg.serverContent
    if (!content) return

    if (content.interrupted) {
      // The player started talking over Condoriano: stop the voice right away.
      this.player.flush()
      this.dropAudio = false
      this.finishAssistantText()
      this.turnDone = true
      this.setState('listening')
    }

    if (content.inputTranscription?.text) {
      this.userText += content.inputTranscription.text
      this.ctx.events.onTranscript('user', this.userText.trim(), !!content.inputTranscription.finished)
      if (content.inputTranscription.finished) this.userText = ''
    }

    for (const part of content.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data
      if (!data || !part.inlineData?.mimeType?.startsWith('audio/')) continue
      if (this.turnDone) {
        // First audio of a new answer: whatever the player said before is now final.
        this.turnDone = false
        this.finishUserText()
      }
      if (!this.dropAudio) this.player.pushPcm16(base64ToBytes(data))
    }

    if (content.outputTranscription?.text && !this.dropAudio) {
      this.assistantText += content.outputTranscription.text
      this.ctx.events.onTranscript('assistant', this.assistantText.trim(), false)
    }

    if (content.turnComplete) {
      this.dropAudio = false
      this.turnDone = true
      this.finishUserText()
      this.finishAssistantText()
      if (!this.player.playing) this.setState('listening')
    }
  }

  private answerToolCalls(calls: FunctionCall[]): void {
    this.toolPending = true
    this.setState('thinking')
    const functionResponses: FunctionResponse[] = calls.map((call) => {
      if (call.name !== SEARCH_TOOL.name) {
        return { id: call.id, name: call.name, response: { error: `Unknown tool ${call.name}` } }
      }
      const query = String((call.args as { query?: unknown } | undefined)?.query ?? '')
      return { id: call.id, name: call.name, response: { output: getKnowledgeBase().toolResult(query) } }
    })
    this.session?.sendToolResponse({ functionResponses })
    this.toolPending = false
  }

  private finishUserText(): void {
    if (this.userText.trim()) this.ctx.events.onTranscript('user', this.userText.trim(), true)
    this.userText = ''
  }

  private finishAssistantText(): void {
    if (this.assistantText.trim()) this.ctx.events.onTranscript('assistant', this.assistantText.trim(), true)
    this.assistantText = ''
  }
}
