'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { RouteKanbanCard } from '@/components/RouteKanbanCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getLocalDateInputValue } from '@/lib/utils'
import type { Route, PaginatedResponse, RouteStatus } from '@/lib/types'

const COLUMNS: { status: RouteStatus; label: string; color: string }[] = [
  { status: 'PLANIFICADA', label: 'Planificadas', color: 'bg-stone-100' },
  { status: 'EN_CURSO', label: 'En curso', color: 'bg-blue-50' },
  { status: 'COMPLETADA', label: 'Completadas', color: 'bg-green-50' },
  { status: 'CON_NOVEDAD', label: 'Con novedad', color: 'bg-red-50' },
]

export default function RutasPage() {
  const [date, setDate] = useState(() => getLocalDateInputValue())

  const queries = COLUMNS.map(col =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ['routes', col.status, date],
      queryFn: () => {
        const params = new URLSearchParams({ status: col.status, date, pageSize: '50' })
        return api.get<PaginatedResponse<Route>>(`/api/rutas?${params}`)
      },
    })
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-stone-700">Filtrar por fecha</h2>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40" />
        </div>
        <Button asChild>
          <Link href="/rutas/nueva">
            <Plus className="h-4 w-4" />
            Nueva Ruta
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col, i) => {
          const { data, isLoading } = queries[i]
          return (
            <div key={col.status} className={`rounded-xl p-3 ${col.color}`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-700">{col.label}</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-500 shadow-sm">
                  {data?.total ?? '…'}
                </span>
              </div>
              <div className="space-y-3">
                {isLoading
                  ? Array.from({ length: 2 }).map((_, j) => <Skeleton key={j} className="h-28" />)
                  : data?.items?.length === 0
                  ? <p className="py-6 text-center text-xs text-stone-400">Sin rutas</p>
                  : data?.items?.map(route => <RouteKanbanCard key={route.id} route={route} />)
                }
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
