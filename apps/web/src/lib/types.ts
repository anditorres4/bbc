// API-aligned types (matches Prisma schema + actual API responses)

export type BarrelStatus =
  | 'EN_BODEGA'
  | 'EN_ALISTAMIENTO'
  | 'EN_TRANSPORTE'
  | 'ENTREGADO'
  | 'EN_RECOGIDA'
  | 'DEVUELTO'
  | 'EN_MANTENIMIENTO'
  | 'BAJA'

export type EventType =
  | 'REGISTRO'
  | 'ALISTAMIENTO'
  | 'SALIDA_BODEGA'
  | 'LLEGADA_PUNTO'
  | 'ENTREGA_LLENO'
  | 'RECOGIDA_VACIO'
  | 'RETORNO_BODEGA'
  | 'ENVIO_MANTENIMIENTO'
  | 'RETORNO_MANTENIMIENTO'
  | 'DISPOSICION_FINAL'
  | 'NOVEDAD'

export type Role = 'ADMIN' | 'SUPERVISOR' | 'OPERARIO_BODEGA' | 'TRANSPORTISTA'
export type RouteStatus = 'PLANIFICADA' | 'EN_CURSO' | 'COMPLETADA' | 'CON_NOVEDAD' | 'CANCELADA'
export type StopStatus = 'PENDIENTE' | 'COMPLETADA' | 'CON_NOVEDAD' | 'CANCELADA'
export type AlertType =
  | 'SIN_MOVIMIENTO_60_DIAS'
  | 'NOVEDAD_EN_RUTA'
  | 'BARRIL_PROXIMO_MANTENIMIENTO'
  | 'BARRIL_FIN_VIDA_UTIL'
  | 'RUTA_SIN_CERRAR'
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface User {
  id: string
  email: string
  name: string
  phone: string | null
  role: Role
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Barrel {
  id: string
  qrCode: string
  status: BarrelStatus
  product: string | null
  capacity: number
  manufactureDate: string
  lastMaintenanceDate: string | null
  maxLifeYears: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  createdBy?: Pick<User, 'id' | 'name'>
}

export interface BarrelEvent {
  id: string
  barrelId: string
  type: EventType
  fromStatus: BarrelStatus | null
  toStatus: BarrelStatus
  userId: string
  routeId: string | null
  deliveryPointId: string | null
  lat: number | null
  lng: number | null
  notes: string | null
  timestamp: string
  user?: Pick<User, 'id' | 'name'>
}

export interface BarrelDetail extends Barrel {
  events: BarrelEvent[]
}

export interface DeliveryPoint {
  id: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  phone: string | null
  contactName: string | null
  isActive: boolean
  createdAt: string
}

export interface RouteStopBarrel {
  id: string
  barrelId: string
  product: string
  status: string
  barrel?: Pick<Barrel, 'id' | 'qrCode'>
}

export interface RouteStop {
  id: string
  routeId: string
  deliveryPointId: string
  position: number
  status: StopStatus
  barrelsDelivered: number
  totalBarrels: number
  deliveryPoint?: DeliveryPoint
  barrels?: RouteStopBarrel[]
}

export interface Route {
  id: string
  name: string
  date: string
  status: RouteStatus
  vehiclePlate: string | null
  transportistId: string
  createdById: string
  createdAt: string
  transportist?: Pick<User, 'id' | 'name'>
  stops?: RouteStop[]
}

export interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  message: string
  isRead: boolean
  barrelId: string | null
  routeId: string | null
  targetRoles: Role[]
  createdAt: string
  readAt: string | null
  barrel?: Pick<Barrel, 'id' | 'qrCode'> | null
  route?: Pick<Route, 'id' | 'name'> | null
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

export interface QrResponse {
  id: string
  qrCode: string
  qrImage: string
}
