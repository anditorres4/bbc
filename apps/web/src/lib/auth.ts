'use client'

const ACCESS_KEY = 'bbc_access'

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(ACCESS_KEY)
}

export function setAccessToken(token: string) {
  sessionStorage.setItem(ACCESS_KEY, token)
}

export function clearAccessToken() {
  sessionStorage.removeItem(ACCESS_KEY)
}
