import { MMKV } from 'react-native-mmkv'
import { getAccessToken } from './auth'

const storage = new MMKV({ id: 'bbc-offline' })
const QUEUE_KEY = 'offline_queue'
const SESSION_COUNT_KEY = 'session_count'
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'

export interface QueuedRequest {
  id: string
  endpoint: string
  method: 'POST' | 'PATCH'
  body: unknown
  timestamp: number
  retries: number
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function getQueue(): QueuedRequest[] {
  const raw = storage.getString(QUEUE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as QueuedRequest[]
  } catch {
    return []
  }
}

function setQueue(items: QueuedRequest[]): void {
  storage.set(QUEUE_KEY, JSON.stringify(items))
}

export function enqueue(endpoint: string, method: 'POST' | 'PATCH', body: unknown): void {
  const items = getQueue()
  items.push({ id: generateId(), endpoint, method, body, timestamp: Date.now(), retries: 0 })
  setQueue(items)
}

export function queueSize(): number {
  return getQueue().length
}

export async function drainQueue(): Promise<void> {
  const items = getQueue()
  if (items.length === 0) return

  const token = await getAccessToken()
  const remaining: QueuedRequest[] = []

  for (const item of items) {
    if (item.retries >= 3) continue
    try {
      const res = await fetch(`${BASE}${item.endpoint}`, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(item.body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      remaining.push({ ...item, retries: item.retries + 1 })
    }
  }

  setQueue(remaining)
}

export function incrementSessionCount(): void {
  const current = storage.getNumber(SESSION_COUNT_KEY) ?? 0
  storage.set(SESSION_COUNT_KEY, current + 1)
}

export function getSessionCount(): number {
  return storage.getNumber(SESSION_COUNT_KEY) ?? 0
}

export function resetSessionCount(): void {
  storage.set(SESSION_COUNT_KEY, 0)
}
