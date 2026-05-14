import NetInfo from '@react-native-community/netinfo'
import { api, OfflineError } from '@/lib/api'
import { enqueue } from '@/lib/offlineQueue'

export interface ApiResult<T> {
  data?: T
  queued?: boolean
  error?: string
}

export async function apiCall<T = unknown>(
  endpoint: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>
): Promise<ApiResult<T>> {
  const state = await NetInfo.fetch()
  const connected = state.isConnected ?? false

  if (!connected) {
    enqueue(endpoint, method, body)
    return { queued: true }
  }

  try {
    const data = method === 'POST'
      ? await api.post<T>(endpoint, body)
      : await api.patch<T>(endpoint, body)
    return { data }
  } catch (err) {
    if (err instanceof OfflineError) {
      enqueue(endpoint, method, body)
      return { queued: true }
    }
    const e = err as { message?: string }
    return { error: e.message ?? 'Error desconocido' }
  }
}
