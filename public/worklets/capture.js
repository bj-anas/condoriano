// Mic capture: downsamples the context rate to 16 kHz mono PCM16 and posts 100 ms chunks.
// Runs on the audio thread, so background-tab timer throttling does not affect it.
const TARGET_RATE = 16000
const CHUNK = 1600

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / TARGET_RATE
    this.phase = 0
    this.acc = 0
    this.accCount = 0
    this.buffer = new Int16Array(CHUNK)
    this.length = 0
    this.sumSq = 0
  }

  emit(sample) {
    const s = Math.max(-1, Math.min(1, sample))
    this.buffer[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff
    this.sumSq += s * s
    if (this.length === CHUNK) {
      const rms = Math.sqrt(this.sumSq / CHUNK)
      this.port.postMessage({ pcm: this.buffer.buffer, rms }, [this.buffer.buffer])
      this.buffer = new Int16Array(CHUNK)
      this.length = 0
      this.sumSq = 0
    }
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input) return true
    // Box-filter downsampling: average every input sample that falls in one output sample's window.
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i]
      this.accCount++
      this.phase += 1
      if (this.phase >= this.ratio) {
        this.emit(this.acc / this.accCount)
        this.acc = 0
        this.accCount = 0
        this.phase -= this.ratio
      }
    }
    return true
  }
}

registerProcessor('capture-processor', CaptureProcessor)
