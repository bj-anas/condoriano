import { AiError, fromHttp, toAiError } from '../errors'
import type { ChatTurn } from '../types'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

interface GeminiPart {
  text?: string
  thought?: boolean
  inlineData?: { mimeType: string; data: string }
}

/**
 * Validates a key with a free request (listing models costs no quota)
 * and returns the model ids this key can use.
 */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  let res: Response
  try {
    res = await fetch(`${BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } })
  } catch (err) {
    throw toAiError(err)
  }
  if (!res.ok) throw await fromHttp(res)
  const body = (await res.json()) as { models?: { name: string }[] }
  return (body.models ?? []).map((m) => m.name.replace(/^models\//, ''))
}

export async function geminiComplete(opts: {
  apiKey: string
  model: string
  system: string
  history: ChatTurn[]
  signal?: AbortSignal
  /** Lets the model use Google Search (the prompt says: only after the player agrees). */
  webSearch?: boolean
}): Promise<string> {
  const contents = opts.history.map((turn) => {
    const parts: GeminiPart[] = []
    if (turn.image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: turn.image } })
    parts.push({ text: turn.text })
    return { role: turn.role === 'assistant' ? 'model' : 'user', parts }
  })

  let res: Response
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(opts.model)}:generateContent`, {
      method: 'POST',
      signal: opts.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents,
        generationConfig: { temperature: 0.4 },
        ...(opts.webSearch ? { tools: [{ googleSearch: {} }] } : {}),
      }),
    })
  } catch (err) {
    throw toAiError(err)
  }
  if (!res.ok) throw await fromHttp(res)

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
    promptFeedback?: { blockReason?: string }
  }
  const parts = body.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join('')
    .trim()
  if (!text) {
    const reason = body.promptFeedback?.blockReason ?? body.candidates?.[0]?.finishReason ?? 'empty reply'
    throw new AiError('unknown', `The model returned no answer (${reason}).`)
  }
  return text
}
