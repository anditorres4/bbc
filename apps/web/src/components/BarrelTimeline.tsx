import {
  Package, Truck, MapPin, ArrowDownToLine, RotateCcw,
  Wrench, Ban, AlertTriangle, CheckCircle2, Circle
} from 'lucide-react'
import { formatRelative, formatDate } from '@/lib/utils'
import { BarrelStatusBadge } from './BarrelStatusBadge'
import type { BarrelEvent, EventType } from '@/lib/types'

const EVENT_ICON: Record<EventType, React.ReactNode> = {
  REGISTRO: <Package className="h-4 w-4" />,
  ALISTAMIENTO: <CheckCircle2 className="h-4 w-4" />,
  SALIDA_BODEGA: <Truck className="h-4 w-4" />,
  LLEGADA_PUNTO: <MapPin className="h-4 w-4" />,
  ENTREGA_LLENO: <ArrowDownToLine className="h-4 w-4" />,
  RECOGIDA_VACIO: <RotateCcw className="h-4 w-4" />,
  RETORNO_BODEGA: <Package className="h-4 w-4" />,
  ENVIO_MANTENIMIENTO: <Wrench className="h-4 w-4" />,
  RETORNO_MANTENIMIENTO: <Wrench className="h-4 w-4" />,
  DISPOSICION_FINAL: <Ban className="h-4 w-4" />,
  NOVEDAD: <AlertTriangle className="h-4 w-4" />,
}

const EVENT_LABEL: Record<EventType, string> = {
  REGISTRO: 'Registro',
  ALISTAMIENTO: 'Alistamiento',
  SALIDA_BODEGA: 'Salida de bodega',
  LLEGADA_PUNTO: 'Llegada al punto',
  ENTREGA_LLENO: 'Entrega (lleno)',
  RECOGIDA_VACIO: 'Recogida (vacío)',
  RETORNO_BODEGA: 'Retorno a bodega',
  ENVIO_MANTENIMIENTO: 'Enviado a mantenimiento',
  RETORNO_MANTENIMIENTO: 'Retorno de mantenimiento',
  DISPOSICION_FINAL: 'Disposición final',
  NOVEDAD: 'Novedad reportada',
}

interface Props {
  events: BarrelEvent[]
}

export function BarrelTimeline({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-stone-400 text-center py-6">Sin eventos registrados.</p>
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {[...events].reverse().map((event, idx) => (
          <li key={event.id}>
            <div className="relative pb-8">
              {idx < events.length - 1 && (
                <span className="absolute left-4 top-8 -ml-px h-full w-0.5 bg-stone-200" aria-hidden />
              )}
              <div className="relative flex space-x-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-2 ring-white">
                  {EVENT_ICON[event.type] ?? <Circle className="h-4 w-4" />}
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1">
                  <div>
                    <p className="text-sm font-medium text-stone-900">{EVENT_LABEL[event.type]}</p>
                    {event.toStatus && (
                      <div className="mt-0.5">
                        <BarrelStatusBadge status={event.toStatus} />
                      </div>
                    )}
                    {event.notes && <p className="mt-1 text-xs text-stone-500">{event.notes}</p>}
                    {event.user && (
                      <p className="mt-0.5 text-xs text-stone-400">por {event.user.name}</p>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-right text-xs text-stone-400" title={formatDate(event.timestamp)}>
                    {formatRelative(event.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
