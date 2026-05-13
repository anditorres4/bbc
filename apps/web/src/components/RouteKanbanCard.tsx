import Link from 'next/link'
import { User, MapPin, Package } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Route } from '@/lib/types'

interface Props {
  route: Route
}

const totalBarrels = (route: Route) =>
  route.stops?.reduce((sum, s) => sum + s.totalBarrels, 0) ?? 0

const deliveredBarrels = (route: Route) =>
  route.stops?.reduce((sum, s) => sum + s.barrelsDelivered, 0) ?? 0

export function RouteKanbanCard({ route }: Props) {
  const total = totalBarrels(route)
  const delivered = deliveredBarrels(route)
  const progress = total > 0 ? Math.round((delivered / total) * 100) : 0

  return (
    <Link href={`/rutas/${route.id}`}>
      <div className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
        <h4 className="font-semibold text-stone-900 text-sm truncate">{route.name}</h4>
        <p className="text-xs text-stone-400 mt-0.5">{formatDate(route.date)}</p>

        <div className="mt-3 space-y-1.5 text-xs text-stone-600">
          {route.transportist && (
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-stone-400" />
              <span className="truncate">{route.transportist.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-stone-400" />
            <span>{route.stops?.length ?? 0} paradas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-stone-400" />
            <span>{delivered}/{total} barriles</span>
          </div>
        </div>

        {total > 0 && (
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-stone-100">
              <div
                className="h-1.5 rounded-full bg-amber-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-right text-[10px] text-stone-400">{progress}%</p>
          </div>
        )}
      </div>
    </Link>
  )
}
