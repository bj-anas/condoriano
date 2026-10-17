import { SOURCE_RATE, getPlaybackContext, rmsOf, voiceOutput } from './context'
import { diag, log } from '../stores/diag'
import { pcm16ToFloat32 } from './encoding'

/** Streams 24 kHz PCM16 voice through the player worklet. */
export class VoicePlayer {
  private node: AudioWorkletNode | null = null
  private analyser: AnalyserNode | null = null
  private levelBuffer = new Float32Array(512)
  /** Source samples per output sample (24 kHz → the device rate, e.g. 0.5 at 48 kHz). */
  private step = 1
  /** Resampler state carried between chunks so there are no clicks at chunk edges. */
  private pos = 0
  private last = 0
  playing = false

  onPlayingChange: ((playing: boolean) => void) | null = null

  async start(): Promise<void> {
    const ctx = await getPlaybackContext()
    this.step = SOURCE_RATE / ctx.sampleRate
    this.pos = 0
    this.last = 0
    this.node = new AudioWorkletNode(ctx, 'player-processor', { outputChannelCount: [1] })
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.node.connect(this.analyser).connect(voiceOutput(ctx))
    log(`player: ${ctx.sampleRate} Hz → ${voiceOutput(ctx) === ctx.destination ? 'speakers' : '<audio> element'}`)
    this.node.port.onmessage = (e: MessageEvent<{ type: 'started' | 'drained' }>) => {
      this.playing = e.data.type === 'started'
      diag.playing = this.playing
      log(`player ${e.data.type}`)
      this.onPlayingChange?.(this.playing)
    }
  }

  pushPcm16(bytes: Uint8Array): void {
    if (diag.audioChunks++ === 0) log(`first audio chunk: ${bytes.byteLength} bytes`)
    const samples = this.resample(pcm16ToFloat32(bytes))
    this.node?.port.postMessage({ type: 'push', samples }, [samples.buffer])
  }

  /** Linear resampling from 24 kHz to the context rate, continuous across chunks. */
  private resample(input: Float32Array): Float32Array {
    if (this.step === 1) return input
    const out: number[] = []
    // pos is measured in input samples; -1 refers to the last sample of the previous chunk.
    while (this.pos < input.length - 1) {
      const i = Math.floor(this.pos)
      const frac = this.pos - i
      const a = i < 0 ? this.last : input[i]
      const b = input[i + 1]
      out.push(a + (b - a) * frac)
      this.pos += this.step
    }
    this.pos -= input.length
    this.last = input[input.length - 1] ?? this.last
    return Float32Array.from(out)
  }

  /** Drops everything queued and stops speaking immediately. */
  flush(): void {
    this.node?.port.postMessage({ type: 'flush' })
    this.pos = 0
  }

  level(): number {
    return this.analyser ? rmsOf(this.analyser, this.levelBuffer) : 0
  }

  stop(): void {
    this.flush()
    this.node?.port.close()
    this.node?.disconnect()
    this.analyser?.disconnect()
    this.node = this.analyser = null
    this.playing = false
    this.onPlayingChange = null
  }
}
