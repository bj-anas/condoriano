import { computed, reactive } from 'vue'
import { settings } from './settings'

/**
 * In-memory diagnostics for remote debugging (mainly iOS audio). Shown when debug mode is on
 * in Settings, or when the page URL contains `?debug`. Nothing is saved or sent anywhere.
 */
const debugInUrl = new URLSearchParams(location.search).has('debug')

export const debugEnabled = computed(() => debugInUrl || settings.debugMode)

export const diag = reactive({
  lines: [] as string[],
  audioChunks: 0,
  playing: false,
})

export function log(message: string): void {
  if (!debugEnabled.value) return
  const time = new Date().toISOString().slice(11, 19)
  diag.lines.push(`${time} ${message}`)
  if (diag.lines.length > 60) diag.lines.splice(0, diag.lines.length - 60)
}
