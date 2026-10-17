export type AiErrorKind = 'quota' | 'auth' | 'model' | 'network' | 'unknown'

export class AiError extends Error {
  readonly kind: AiErrorKind
  /** For quota errors: whether the daily limit (not the per-minute one) was hit */
  readonly daily: boolean
  readonly retryAfterSec?: number

  constructor(kind: AiErrorKind, message: string, daily = false, retryAfterSec?: number) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
    this.daily = daily
    this.retryAfterSec = retryAfterSec
  }
}

const QUOTA_TEXT = /quota|resource[_ ]exhausted|rate.?limit|too many requests|exceeded/i
const DAILY_TEXT = /per.?day|daily|PerDay|RPD/i

export function isQuotaError(err: unknown): err is AiError {
  return err instanceof AiError && err.kind === 'quota'
}

/** Gemini Live closes the WebSocket with a code and a reason instead of an HTTP status. */
export function fromLiveClose(code: number, reason: string): AiError {
  if (QUOTA_TEXT.test(reason)) return new AiError('quota', reason || 'Quota exceeded', DAILY_TEXT.test(reason))
  if (code === 1007 || /api key/i.test(reason)) return new AiError('auth', reason || 'API key not valid')
  if (code === 1008) return new AiError('model', reason || 'This model does not support the request')
  if (code === 1006) return new AiError('network', 'The connection dropped')
  return new AiError('unknown', reason || `Connection closed (${code})`)
}

/** Builds an AiError from a failed fetch Response (Gemini REST and Groq share this shape). */
export async function fromHttp(res: Response): Promise<AiError> {
  let message = `${res.status} ${res.statusText}`
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string } }
    if (body.error?.message) message = body.error.message
  } catch {
    // not JSON
  }
  const retry = Number(res.headers.get('retry-after')) || undefined
  if (res.status === 429 || QUOTA_TEXT.test(message)) {
    return new AiError('quota', message, DAILY_TEXT.test(message), retry)
  }
  if (res.status === 401 || res.status === 403 || /api key/i.test(message)) return new AiError('auth', message)
  if (res.status === 404 || res.status === 400) return new AiError('model', message)
  return new AiError('unknown', message)
}

export function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err
  if (err instanceof TypeError) return new AiError('network', 'Network error. Check your connection.')
  return new AiError('unknown', err instanceof Error ? err.message : String(err))
}
