import { getPlaybackContext, rmsOf } from './context'
import { pcm16ToFloat32 } from './encoding'

/** Streams 24 kHz PCM16 voice through the player worklet. */
export class VoicePlayer {
  private node: AudioWorkletNode | null = null
  private analyser: AnalyserNode | null = null
  private levelBuffer = new Float32Array(512)
  playing = false

  onPlayingChange: ((playing: boolean) => void) | null = null

  async start(): Promise<void> {
    const ctx = await getPlaybackContext()
    this.node = new AudioWorkletNode(ctx, 'player-processor', { outputChannelCount: [1] })
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.node.connect(this.analyser).connect(ctx.destination)
    this.node.port.onmessage = (e: MessageEvent<{ type: 'started' | 'drained' }>) => {
      this.playing = e.data.type === 'started'
      this.onPlayingChange?.(this.playing)
    }
  }

  pushPcm16(bytes: Uint8Array): void {
    const samples = pcm16ToFloat32(bytes)
    this.node?.port.postMessage({ type: 'push', samples }, [samples.buffer])
  }

  /** Drops everything queued and stops speaking immediately. */
  flush(): void {
    this.node?.port.postMessage({ type: 'flush' })
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
