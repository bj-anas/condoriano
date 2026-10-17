import { AiError, fromHttp, toAiError } from '../errors'
import type { ChatTurn } from '../types'

const BASE = 'https://api.groq.com/openai/v1'

type GroqContent = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[]

export async function validateGroqKey(apiKey: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${BASE}/models`, { headers: { authorization: `Bearer ${apiKey}` } })
  } catch (err) {
    throw toAiError(err)
  }
  if (!res.ok) throw await fromHttp(res)
}

export async function groqComplete(opts: {
  apiKey: string
  model: string
  system: string
  history: ChatTurn[]
  signal?: AbortSignal
}): Promise<string> {
  const messages: { role: string; content: GroqContent }[] = [{ role: 'system', content: opts.system }]
  for (const turn of opts.history) {
    const content: GroqContent = turn.image
      ? [
          { type: 'text', text: turn.text },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${turn.image}` } },
        ]
      : turn.text
    messages.push({ role: turn.role, content })
  }

  let res: Response
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal: opts.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ model: opts.model, messages, temperature: 0.4 }),
    })
  } catch (err) {
    throw toAiError(err)
  }
  if (!res.ok) throw await fromHttp(res)

  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = body.choices?.[0]?.message?.content?.trim()
  if (!text) throw new AiError('unknown', 'The model returned no answer.')
  return text
}
