import { cn } from '@/lib/utils'
import type { BarrelStatus } from '@/lib/types'

const STATUS_CONFIG: Record<BarrelStatus, { label: string; className: string }> = {
  EN_BODEGA: { label: 'En Bodega', className: 'bg-green-600' },
  EN_ALISTAMIENTO: { label: 'En Alistamiento', className: 'bg-amber-500' },
  EN_TRANSPORTE: { label: 'En Transporte', className: 'bg-blue-600' },
  ENTREGADO: { label: 'Entregado', className: 'bg-purple-600' },
  EN_RECOGIDA: { label: 'En Recogida', className: 'bg-cyan-600' },
  DEVUELTO: { label: 'Devuelto', className: 'bg-cyan-600' },
  EN_MANTENIMIENTO: { label: 'Mantenimiento', className: 'bg-amber-600' },
  BAJA: { label: 'Baja', className: 'bg-red-600' },
}

interface Props {
  status: BarrelStatus
  className?: string
}

export function BarrelStatusBadge({ status, className }: Props) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: 'bg-stone-500' }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
