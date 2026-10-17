import { reactive } from 'vue'

/**
 * In-memory diagnostics for remote debugging (mainly iOS audio). Shown only when the page URL
 * contains `?debug`; nothing is saved or sent anywhere.
 */
export const debugEnabled = new URLSearchParams(location.search).has('debug')

export const diag = reactive({
  lines: [] as string[],
  audioChunks: 0,
  playing: false,
})

export function log(message: string): void {
  if (!debugEnabled) return
  const time = new Date().toISOString().slice(11, 19)
  diag.lines.push(`${time} ${message}`)
  if (diag.lines.length > 60) diag.lines.splice(0, diag.lines.length - 60)
}
