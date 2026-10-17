/** Gemini daily quotas reset at midnight Pacific time. */
export function msUntilPacificMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const elapsed = get('hour') * 3600 + get('minute') * 60 + get('second')
  return (24 * 3600 - elapsed) * 1000
}

export function describeWait(until: number): string {
  const minutes = Math.max(1, Math.round((until - Date.now()) / 60_000))
  if (minutes < 60) return `in about ${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.round(minutes / 60)
  return `in about ${hours} hour${hours === 1 ? '' : 's'}`
}
