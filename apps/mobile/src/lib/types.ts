export type BarrelStatus =
  | 'EN_BODEGA'
  | 'EN_ALISTAMIENTO'
  | 'EN_TRANSPORTE'
  | 'ENTREGADO'
  | 'EN_RECOGIDA'
  | 'DEVUELTO'
  | 'EN_MANTENIMIENTO'
  | 'BAJA'

export type Role = 'ADMIN' | 'SUPERVISOR' | 'OPERARIO_BODEGA' | 'TRANSPORTISTA'
export type RouteStatus = 'PLANIFICADA' | 'EN_CURSO' | 'COMPLETADA' | 'CON_NOVEDAD' | 'CANCELADA'
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  isActive: boolean
}

export interface Barrel {
  id: string
  qrCode: string
  status: BarrelStatus
  product: string | null
  capacity: number
  notes: string | null
}

export interface BarrelScanResult {
  barrel: Barrel
  created: boolean
}

export interface RouteStopRequirement {
  id: string
  routeStopId: string
  product: string
  quantity: number
}

export interface RouteStopBarrel {
  id: string
  barrelId: string
  product: string
  status: string
  barrel?: Pick<Barrel, 'id' | 'qrCode'>
}

export interface DeliveryPoint {
  id: string
  name: string
  address: string
}

export interface RouteStop {
  id: string
  routeId: string
  deliveryPointId: string
  position: number
  status: string
  barrelsDelivered: number
  barrelsPickedUp: number
  totalBarrels: number
  deliveryPoint?: DeliveryPoint
  requirements?: RouteStopRequirement[]
  barrels?: RouteStopBarrel[]
}

export interface Route {
  id: string
  name: string
  date: string
  status: RouteStatus
  vehiclePlate: string | null
  transportistId: string
  transportist?: Pick<User, 'id' | 'name'>
  stops?: RouteStop[]
}

export interface Alert {
  id: string
  type: string
  severity: AlertSeverity
  message: string
  isRead: boolean
  barrelId: string | null
  routeId: string | null
  createdAt: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
}
