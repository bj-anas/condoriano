import { MODELS } from '../ai/models'
import { toAiError } from '../ai/errors'
import { listGeminiModels } from '../ai/providers/gemini-rest'
import { validateGroqKey } from '../ai/providers/groq'
import { settings } from '../stores/settings'

/** Checks a Gemini key with a free request and remembers which of our models it can use. */
export async function checkGeminiKey(key: string): Promise<string> {
  try {
    const available = await listGeminiModels(key)
    settings.geminiModels = available
    const ours = MODELS.filter((m) => m.provider === 'gemini' && available.includes(m.apiModel))
    return ours.length
      ? `Key works. Available: ${ours.map((m) => m.label).join(', ')}.`
      : "Key works, but Google doesn't list Condoriano's models for it yet. Calls may fail."
  } catch (err) {
    const error = toAiError(err)
    if (error.kind === 'auth' || error.kind === 'model') {
      throw new Error('Google rejected this key. Copy it again from Google AI Studio.')
    }
    if (error.kind === 'quota') return 'Key works (it is rate-limited right now).'
    throw new Error(error.message)
  }
}

export async function checkGroqKey(key: string): Promise<string> {
  try {
    await validateGroqKey(key)
    return 'Groq key works.'
  } catch (err) {
    const error = toAiError(err)
    if (error.kind === 'auth') throw new Error('Groq rejected this key.')
    if (error.kind === 'quota') return 'Groq key works (it is rate-limited right now).'
    throw new Error(error.message)
  }
}
