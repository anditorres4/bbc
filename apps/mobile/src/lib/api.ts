import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth'

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'

export class OfflineError extends Error {
  constructor() {
    super('No hay conexión a internet')
    this.name = 'OfflineError'
  }
}

export class AuthError extends Error {
  constructor() {
    super('Sesión expirada')
    this.name = 'AuthError'
  }
}

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return null
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const { accessToken, refreshToken: newRefresh } = data as {
      accessToken: string
      refreshToken: string
    }
    await setTokens(accessToken, newRefresh)
    return accessToken
  } catch {
    return null
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

async function request<T>(
  path: string,
  method: Method,
  body?: unknown,
  retry = true
): Promise<T> {
  const token = await getAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new OfflineError()
  }

  if (res.status === 401 && retry) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null
      })
    }
    const newToken = await refreshPromise
    if (!newToken) {
      await clearTokens()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bbc:auth:expired'))
      }
      throw new AuthError()
    }
    return request<T>(path, method, body, false)
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }))
    throw Object.assign(new Error(errBody.error ?? res.statusText), {
      status: res.status,
      code: errBody.code,
    })
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path, 'GET'),
  post: <T>(path: string, body?: unknown) => request<T>(path, 'POST', body),
  patch: <T>(path: string, body?: unknown) => request<T>(path, 'PATCH', body),
  delete: <T>(path: string) => request<T>(path, 'DELETE'),
}
