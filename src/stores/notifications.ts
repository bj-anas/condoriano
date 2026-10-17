import { reactive } from 'vue'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  message?: string
  actions?: ToastAction[]
  /** ms before it closes on its own; 0 keeps it until dismissed */
  timeout: number
}

export const toasts = reactive<Toast[]>([])
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

const DEFAULT_TIMEOUT: Record<ToastKind, number> = { info: 5000, success: 4000, warning: 0, error: 9000 }

export function notify(toast: Omit<Toast, 'id' | 'timeout'> & { timeout?: number }): number {
  // Same title already showing: replace it instead of stacking duplicates.
  const existing = toasts.find((t) => t.title === toast.title)
  if (existing) dismiss(existing.id)

  const id = nextId++
  const timeout = toast.timeout ?? DEFAULT_TIMEOUT[toast.kind]
  toasts.push({ ...toast, id, timeout })
  if (toasts.length > 4) dismiss(toasts[0].id)
  if (timeout > 0) timers.set(id, setTimeout(() => dismiss(id), timeout))
  return id
}

export function dismiss(id: number): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  const index = toasts.findIndex((t) => t.id === id)
  if (index !== -1) toasts.splice(index, 1)
}
