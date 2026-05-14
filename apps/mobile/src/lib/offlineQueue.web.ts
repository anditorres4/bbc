import { getAccessToken } from './auth'

const QUEUE_KEY = 'bbc_pending_events'
const ERROR_KEY = 'bbc_error_events'
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'

export interface QueuedEvent {
  id: string
  endpoint: string
  method: 'POST' | 'PATCH'
  body: Record<string, unknown>
  timestamp: number
  retries: number
}

let _syncing = false

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function readQueue(): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : []
  } catch {
    return []
  }
}

function writeQueue(items: QueuedEvent[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
}

function readErrors(): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(ERROR_KEY)
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : []
  } catch {
    return []
  }
}

function writeErrors(items: QueuedEvent[]): void {
  localStorage.setItem(ERROR_KEY, JSON.stringify(items))
}

export function enqueue(endpoint: string, method: 'POST' | 'PATCH', body: Record<string, unknown>): void {
  const items = readQueue()
  items.push({ id: generateId(), endpoint, method, body, timestamp: Date.now(), retries: 0 })
  writeQueue(items)
}

export function dequeue(): QueuedEvent | undefined {
  const items = readQueue()
  const first = items.shift()
  if (first !== undefined) writeQueue(items)
  return first
}

export function getAll(): QueuedEvent[] {
  return readQueue()
}

export function size(): number {
  return readQueue().length
}

export function moveToErrors(event: QueuedEvent): void {
  const errors = readErrors()
  errors.push(event)
  writeErrors(errors)
}

export function getErrors(): QueuedEvent[] {
  return readErrors()
}

export function clearErrors(): void {
  writeErrors([])
}

export async function processQueue(onProgress?: (pending: number) => void): Promise<void> {
  if (_syncing) return
  _syncing = true
  try {
    const all = readQueue()
    if (all.length === 0) return

    const token = await getAccessToken()
    const remaining: QueuedEvent[] = []
    let networkFailed = false

    for (const item of all) {
      if (networkFailed) {
        remaining.push(item)
        continue
      }
      if (item.retries >= 3) {
        moveToErrors(item)
        continue
      }
      try {
        const res = await fetch(`${BASE}${item.endpoint}`, {
          method: item.method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(item.body),
        })
        if (res.status >= 400 && res.status < 500) {
          moveToErrors(item)
        } else if (!res.ok) {
          remaining.push({ ...item, retries: item.retries + 1 })
        }
      } catch {
        remaining.push({ ...item, retries: item.retries + 1 })
        networkFailed = true
      }
    }

    writeQueue(remaining)
    onProgress?.(remaining.length)
  } finally {
    _syncing = false
  }
}
