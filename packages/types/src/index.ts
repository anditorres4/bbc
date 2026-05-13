// Barrel domain types shared across api, web, and mobile

export type BarrelStatus =
  | 'EN_BODEGA'
  | 'EN_ALISTAMIENTO'
  | 'EN_TRANSPORTE'
  | 'ENTREGADO'
  | 'EN_RECOGIDA'
  | 'DEVUELTO'
  | 'BAJA'

export type UserRole = 'ADMIN' | 'BODEGA' | 'ALISTAMIENTO' | 'CONDUCTOR' | 'CLIENTE'

export interface Barrel {
  id: string
  qrCode: string
  status: BarrelStatus
  product: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  active: boolean
  createdAt: string
}

export interface BarrelEvent {
  id: string
  barrelId: string
  userId: string
  status: BarrelStatus
  notes: string | null
  latitude: number | null
  longitude: number | null
  createdAt: string
  barrel?: Barrel
  user?: Pick<User, 'id' | 'name' | 'role'>
}

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface ApiError {
  error: string
  code?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface AuthTokens {
  accessToken: string
}

export interface LoginCredentials {
  email: string
  password: string
}

// SSE event types for real-time alerts
export type SseEventType = 'barrel:moved' | 'barrel:alert' | 'barrel:overdue'

export interface SseEvent<T = unknown> {
  type: SseEventType
  payload: T
  timestamp: string
}
