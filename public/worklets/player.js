// Voice playback: plays queued Float32 chunks back to back, and can be flushed instantly
// (used for interruptions and the Pause button).
const SILENT_BLOCKS_BEFORE_DRAINED = 40 // ~200 ms at 24 kHz, absorbs network jitter

class PlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.queue = []
    this.offset = 0
    this.playing = false
    this.silentBlocks = 0
    this.port.onmessage = (event) => {
      const msg = event.data
      if (msg.type === 'push') {
        this.queue.push(msg.samples)
      } else if (msg.type === 'flush') {
        this.queue = []
        this.offset = 0
        this.setPlaying(false)
      }
    }
  }

  setPlaying(value) {
    if (this.playing === value) return
    this.playing = value
    this.port.postMessage({ type: value ? 'started' : 'drained' })
  }

  process(_inputs, outputs) {
    const channels = outputs[0]
    const out = channels[0]
    let written = 0
    while (written < out.length && this.queue.length) {
      const current = this.queue[0]
      const n = Math.min(out.length - written, current.length - this.offset)
      out.set(current.subarray(this.offset, this.offset + n), written)
      written += n
      this.offset += n
      if (this.offset >= current.length) {
        this.queue.shift()
        this.offset = 0
      }
    }
    if (written < out.length) out.fill(0, written)
    for (let c = 1; c < channels.length; c++) channels[c].set(out)

    if (written > 0) {
      this.silentBlocks = 0
      this.setPlaying(true)
    } else if (this.playing && ++this.silentBlocks >= SILENT_BLOCKS_BEFORE_DRAINED) {
      this.setPlaying(false)
    }
    return true
  }
}

registerProcessor('player-processor', PlayerProcessor)
