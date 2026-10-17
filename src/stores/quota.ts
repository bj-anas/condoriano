import { computed, reactive, watch } from 'vue'
import { MODELS } from '../ai/models'
import { fetchGoogleEmail, googleAccessToken, signInWithGoogle, signOutOfGoogle } from '../auth/google'
import { msUntilPacificMidnight } from '../call/time'
import { settings } from './settings'
import { log } from './diag'

/**
 * Real Gemini quota from Google Cloud Monitoring, read with the signed-in Google account.
 * Google publishes per-model metrics for free-tier requests:
 *   generativelanguage.googleapis.com/quota/generate_content_free_tier_requests/usage
 *   generativelanguage.googleapis.com/quota/generate_content_free_tier_requests/limit
 * Only the daily (PerDay) limit is shown. Monitoring data is 1–4 minutes behind real time.
 * Nothing here is estimated: a model with no data from Google shows no numbers.
 */
const METRIC = 'generativelanguage.googleapis.com/quota/generate_content_free_tier_requests'
const MONITORING = 'https://monitoring.googleapis.com/v3/projects'
const REFRESH_EVERY_MS = 120_000
const REFRESH_AFTER_REQUEST_MS = 20_000

export interface QuotaInfo {
  /** 0–100, or null when Google has no data for this model */
  percent: number | null
  used: number | null
  limit: number | null
  /** When the numbers were fetched (ms) */
  asOf: number | null
}

interface ModelQuota {
  used: number | null
  limit: number | null
}

export const quota = reactive({
  connected: false,
  email: '',
  projects: [] as { id: string; name: string }[],
  loading: false,
  error: '',
  asOf: null as number | null,
  /** keyed by the model id Google reports (e.g. gemini-3.8-flash) */
  models: {} as Record<string, ModelQuota>,
})

/** Rings show only when signed in with a project chosen. */
export const trackingActive = computed(() => quota.connected && !!settings.quotaProjectId)

async function googleGet<T>(url: string): Promise<T> {
  const accessToken = googleAccessToken()
  if (!accessToken) {
    quota.connected = false
    throw new Error('Your Google session expired. Reconnect to keep tracking quota.')
  }
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
  if (res.status === 401) {
    quota.connected = false
    throw new Error('Your Google session expired. Reconnect to keep tracking quota.')
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch {
      // not JSON
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

async function loadProjects(): Promise<void> {
  const body = await googleGet<{ projects?: { projectId: string; name?: string; lifecycleState?: string }[] }>(
    'https://cloudresourcemanager.googleapis.com/v1/projects?pageSize=200',
  )
  quota.projects = (body.projects ?? [])
    .filter((p) => p.lifecycleState !== 'DELETE_REQUESTED')
    .map((p) => ({ id: p.projectId, name: p.name || p.projectId }))
  const ids = quota.projects.map((p) => p.id)
  if (!ids.includes(settings.quotaProjectId)) {
    // AI Studio creates projects named gen-lang-client-…; prefer one of those.
    settings.quotaProjectId = ids.find((id) => id.startsWith('gen-lang-client')) ?? ids[0] ?? ''
  }
}

/** Sign in (from a click), find the AI Studio project and load the numbers. */
export async function connectGoogle(): Promise<void> {
  quota.error = ''
  quota.loading = true
  try {
    const accessToken = await signInWithGoogle()
    quota.connected = true
    settings.quotaSignedIn = true
    quota.email = await fetchGoogleEmail(accessToken)
    await loadProjects()
    await refreshQuota()
  } catch (err) {
    quota.error = err instanceof Error ? err.message : String(err)
  } finally {
    quota.loading = false
  }
}

export function disconnectGoogle(): void {
  signOutOfGoogle()
  Object.assign(quota, { connected: false, email: '', projects: [], error: '', asOf: null, models: {} })
  settings.quotaSignedIn = false
}

interface TimeSeriesResponse {
  timeSeries?: {
    metric?: { labels?: Record<string, string> }
    points?: { value?: { int64Value?: string; doubleValue?: number } }[]
  }[]
}

/** Per-model values of one metric since midnight Pacific (Google's daily reset). */
async function readMetric(kind: 'usage' | 'limit'): Promise<Record<string, number>> {
  const now = Date.now()
  const sinceMidnight = Math.max(60_000, 24 * 3600_000 - msUntilPacificMidnight())
  const params = new URLSearchParams({
    filter: `metric.type="${METRIC}/${kind}" AND metric.labels.limit_name=has_substring("PerDay")`,
    'interval.startTime': new Date(now - sinceMidnight).toISOString(),
    'interval.endTime': new Date(now).toISOString(),
    'aggregation.alignmentPeriod': `${Math.ceil(sinceMidnight / 1000)}s`,
    // usage: add up today's requests; limit: the current value
    'aggregation.perSeriesAligner': kind === 'usage' ? 'ALIGN_SUM' : 'ALIGN_MAX',
    'aggregation.crossSeriesReducer': kind === 'usage' ? 'REDUCE_SUM' : 'REDUCE_MAX',
    'aggregation.groupByFields': 'metric.label.model',
  })
  const body = await googleGet<TimeSeriesResponse>(
    `${MONITORING}/${encodeURIComponent(settings.quotaProjectId)}/timeSeries?${params}`,
  )
  const values: Record<string, number> = {}
  for (const series of body.timeSeries ?? []) {
    const model = series.metric?.labels?.model
    const point = series.points?.[0]?.value
    if (!model || !point) continue
    values[model] = Number(point.int64Value ?? point.doubleValue ?? 0)
  }
  log(`quota ${kind}: ${JSON.stringify(values)}`)
  return values
}

let refreshing = false

export async function refreshQuota(): Promise<void> {
  if (!trackingActive.value || refreshing) return
  refreshing = true
  quota.loading = true
  try {
    const [usage, limits] = await Promise.all([readMetric('usage'), readMetric('limit')])
    const models: Record<string, ModelQuota> = {}
    for (const model of new Set([...Object.keys(usage), ...Object.keys(limits)])) {
      models[model] = { used: usage[model] ?? 0, limit: limits[model] ?? null }
    }
    quota.models = models
    quota.asOf = Date.now()
    quota.error = ''
  } catch (err) {
    quota.error = err instanceof Error ? err.message : String(err)
  } finally {
    quota.loading = false
    refreshing = false
  }
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined

/** After a Gemini request, refresh a little later (Monitoring lags behind). */
export function scheduleQuotaRefresh(): void {
  if (!trackingActive.value) return
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => void refreshQuota(), REFRESH_AFTER_REQUEST_MS)
}

let interval: ReturnType<typeof setInterval> | undefined
watch(
  trackingActive,
  (active) => {
    clearInterval(interval)
    if (active) interval = setInterval(() => void refreshQuota(), REFRESH_EVERY_MS)
  },
  { immediate: true },
)
watch(() => settings.quotaProjectId, () => void refreshQuota())

/** Google's numbers for one of our models; null means no ring (not tracked or not a Google model). */
export function quotaFor(modelId: string): QuotaInfo | null {
  const model = MODELS.find((m) => m.id === modelId)
  if (!model || model.provider !== 'gemini' || !trackingActive.value) return null
  const data =
    quota.models[model.apiModel] ??
    Object.entries(quota.models).find(([name]) => name.startsWith(model.apiModel))?.[1]
  if (!data || data.limit === null || data.limit <= 0) {
    return { percent: null, used: data?.used ?? null, limit: null, asOf: quota.asOf }
  }
  const used = data.used ?? 0
  return { percent: Math.min(100, (used / data.limit) * 100), used, limit: data.limit, asOf: quota.asOf }
}
