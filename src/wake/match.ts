export type WakeSensitivity = 'low' | 'medium' | 'high'

const NAME = 'condoriano'
const GREETINGS = ['hoy', 'hey', 'hoi', 'oi', 'oy', 'ahoy', 'hi', 'hello', 'ok', 'okay']

/** Max edits allowed between what was heard and "condoriano". */
const MAX_DISTANCE: Record<WakeSensitivity, number> = { low: 1, medium: 2, high: 3 }

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Smallest edit distance between `pattern` and any substring of `text` (Sellers' algorithm). */
export function substringDistance(pattern: string, text: string): number {
  let prev = new Array<number>(text.length + 1).fill(0)
  for (let i = 1; i <= pattern.length; i++) {
    const cur = new Array<number>(text.length + 1)
    cur[0] = i
    for (let j = 1; j <= text.length; j++) {
      const cost = pattern[i - 1] === text[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return Math.min(...prev)
}

/**
 * True when the transcript contains "Hoy Condoriano" closely enough for the chosen sensitivity.
 * The recognizer often splits the name ("condo riano"), so spaces are ignored when matching it.
 */
export function matchesWakePhrase(transcript: string, sensitivity: WakeSensitivity): boolean {
  const text = normalize(transcript)
  if (!text) return false
  // "k" and "c" sound the same in the name, so the recognizer may spell it either way.
  const joined = text.replace(/ /g, '').replace(/k/g, 'c')
  const distance = substringDistance(NAME, joined)
  const greeted = text.split(' ').some((w) => GREETINGS.includes(w))
  const max = MAX_DISTANCE[sensitivity]
  if (distance > max) return false
  // Low sensitivity also requires the greeting; medium needs it unless the name was near-perfect.
  if (sensitivity === 'low') return greeted
  if (sensitivity === 'medium') return greeted || distance <= 1
  return true
}
