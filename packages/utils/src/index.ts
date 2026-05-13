import type { BarrelStatus } from '@bbc/types'

// QR code parsing helpers
export function parseBarrelQr(raw: string): { qrCode: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return { qrCode: trimmed }
}

export function formatQrCode(qrCode: string): string {
  return qrCode.toUpperCase().replace(/[^A-Z0-9-]/g, '')
}

// Barrel status helpers
const STATUS_LABELS: Record<BarrelStatus, string> = {
  EN_BODEGA: 'En Bodega',
  EN_ALISTAMIENTO: 'En Alistamiento',
  EN_TRANSPORTE: 'En Transporte',
  ENTREGADO: 'Entregado',
  EN_RECOGIDA: 'En Recogida',
  DEVUELTO: 'Devuelto',
  BAJA: 'Baja',
}

export function getStatusLabel(status: BarrelStatus): string {
  return STATUS_LABELS[status] ?? status
}

const STATUS_ORDER: BarrelStatus[] = [
  'EN_BODEGA',
  'EN_ALISTAMIENTO',
  'EN_TRANSPORTE',
  'ENTREGADO',
  'EN_RECOGIDA',
  'DEVUELTO',
]

export function getNextStatus(current: BarrelStatus): BarrelStatus | null {
  const idx = STATUS_ORDER.indexOf(current)
  if (idx === -1 || idx === STATUS_ORDER.length - 1) return null
  return STATUS_ORDER[idx + 1]
}

// Date helpers
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isOverdue(updatedAt: string, thresholdHours = 24): boolean {
  const diff = Date.now() - new Date(updatedAt).getTime()
  return diff > thresholdHours * 60 * 60 * 1000
}
