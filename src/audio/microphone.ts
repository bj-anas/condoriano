import { getMicContext, rmsOf } from './context'

export interface MicChunk {
  /** 100 ms of 16 kHz mono PCM16, little-endian */
  pcm: ArrayBuffer
  rms: number
}

export class MicrophoneError extends Error {
  readonly reason: 'denied' | 'missing' | 'unknown'

  constructor(message: string, reason: MicrophoneError['reason']) {
    super(message)
    this.reason = reason
  }
}

export class Microphone {
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private node: AudioWorkletNode | null = null
  private sink: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private levelBuffer = new Float32Array(512)

  onChunk: ((chunk: MicChunk) => void) | null = null

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (err) {
      const name = (err as DOMException).name
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new MicrophoneError('Microphone access was blocked. Allow it in the address bar.', 'denied')
      }
      if (name === 'NotFoundError') throw new MicrophoneError('No microphone was found.', 'missing')
      throw new MicrophoneError(`Could not open the microphone (${name}).`, 'unknown')
    }

    const ctx = await getMicContext()
    this.source = ctx.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(ctx, 'capture-processor')
    this.node.port.onmessage = (e: MessageEvent<MicChunk>) => this.onChunk?.(e.data)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 512
    // The worklet must be connected to the destination to be pulled; the gain keeps it silent.
    this.sink = ctx.createGain()
    this.sink.gain.value = 0
    this.source.connect(this.analyser)
    this.source.connect(this.node).connect(this.sink).connect(ctx.destination)
  }

  /** Current input level, 0..~1, for visuals only. */
  level(): number {
    return this.analyser ? rmsOf(this.analyser, this.levelBuffer) : 0
  }

  stop(): void {
    this.node?.port.close()
    this.source?.disconnect()
    this.node?.disconnect()
    this.sink?.disconnect()
    this.analyser?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = this.source = this.node = this.sink = this.analyser = null
    this.onChunk = null
  }
}
