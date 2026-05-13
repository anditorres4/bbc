const ACCESS_KEY = 'bbc_access_token'
const REFRESH_KEY = 'bbc_refresh_token'
const USER_KEY = 'bbc_user'

export async function getAccessToken(): Promise<string | null> {
  return localStorage.getItem(ACCESS_KEY)
}

export async function getRefreshToken(): Promise<string | null> {
  return localStorage.getItem(REFRESH_KEY)
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

export async function clearTokens(): Promise<void> {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
}

export async function storeUser(user: object): Promise<void> {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export async function getStoredUser<T>(): Promise<T | null> {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
