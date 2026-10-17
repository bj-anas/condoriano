import type { ModelOption } from './types'

/**
 * Model ids checked against ai.google.dev and console.groq.com on 2026-10-16.
 * Free limits change often; check AI Studio for the current numbers.
 */
export const MODELS: ModelOption[] = [
  {
    id: 'gemini-3.8-live',
    apiModel: 'gemini-3.8-live',
    label: 'Gemini 3.8 Live',
    provider: 'gemini',
    engine: 'live',
    supportsImages: true,
    tier: 'live',
    description: 'Real-time voice. You can interrupt it mid-sentence.',
  },
  {
    id: 'gemini-3.8-flash',
    apiModel: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    provider: 'gemini',
    engine: 'turn',
    supportsImages: true,
    tier: 'flash',
    description: 'Turn-based voice. Best for screenshots and harder questions. Small daily limit.',
  },
  {
    id: 'gemini-3.5-flash-lite',
    apiModel: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    provider: 'gemini',
    engine: 'turn',
    supportsImages: true,
    tier: 'lite',
    description: 'Turn-based voice. Fast, with a bigger daily limit.',
  },
  {
    id: 'groq:qwen/qwen3.8-27b',
    apiModel: 'qwen/qwen3.8-27b',
    label: 'Groq · Qwen 3.8 27B',
    provider: 'groq',
    engine: 'turn',
    supportsImages: true,
    tier: 'fallback',
    description: 'Turn-based voice. Backup when Gemini limits are used up. Needs a Groq key.',
  },
  {
    id: 'groq:openai/gpt-oss-20b',
    apiModel: 'openai/gpt-oss-20b',
    label: 'Groq · GPT-OSS 20B',
    provider: 'groq',
    engine: 'turn',
    supportsImages: false,
    tier: 'fallback',
    description: 'Turn-based voice. Very fast backup. Needs a Groq key.',
  },
]

export const LIVE_VOICES = [
  'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
  'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird',
  'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
]

export function modelById(id: string): ModelOption | undefined {
  return MODELS.find((m) => m.id === id)
}

const COMPLEX = /\b(why|compare|explain|difference|better|best|should i|worth|strategy|plan|recommend)\b/i

/** Auto routing for turn-based models: is this a question for Flash rather than Flash-Lite? */
export function isComplexQuestion(text: string, hasImage: boolean): boolean {
  return hasImage || text.split(/\s+/).length > 16 || COMPLEX.test(text)
}
