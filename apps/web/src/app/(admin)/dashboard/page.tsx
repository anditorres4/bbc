'use client'

import { useQuery } from '@tanstack/react-query'
import { Package, Truck, Warehouse, Bell } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { StatCard } from '@/components/StatCard'
import { RouteKanbanCard } from '@/components/RouteKanbanCard'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelative } from '@/lib/utils'
import type { PaginatedResponse, Barrel, Route, Alert } from '@/lib/types'

function useBarrelStats() {
  return useQuery({
    queryKey: ['barrels', 'stats'],
    queryFn: async () => {
      const [all, bodega, transporte, alertas] = await Promise.all([
        api.get<PaginatedResponse<Barrel>>('/api/barriles?pageSize=1'),
        api.get<PaginatedResponse<Barrel>>('/api/barriles?status=EN_BODEGA&pageSize=1'),
        api.get<PaginatedResponse<Barrel>>('/api/barriles?status=EN_TRANSPORTE&pageSize=1'),
        api.get<PaginatedResponse<Alert>>('/api/alertas?isRead=false&pageSize=1'),
      ])
      return { all: all.total, bodega: bodega.total, transporte: transporte.total, alertas: alertas.total }
    },
  })
}

function useActiveRoutes() {
  return useQuery({
    queryKey: ['routes', 'active'],
    queryFn: () => api.get<PaginatedResponse<Route>>('/api/rutas?status=EN_CURSO&pageSize=10'),
  })
}

function useRecentAlerts() {
  return useQuery({
    queryKey: ['alerts', 'recent'],
    queryFn: () => api.get<PaginatedResponse<Alert>>('/api/alertas?pageSize=5'),
  })
}

const SEVERITY_BG: Record<string, string> = {
  CRITICAL: 'border-l-4 border-red-500 bg-red-50',
  WARNING: 'border-l-4 border-amber-400 bg-amber-50',
  INFO: 'border-l-4 border-stone-300 bg-stone-50',
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useBarrelStats()
  const { data: routes, isLoading: routesLoading } = useActiveRoutes()
  const { data: alerts } = useRecentAlerts()

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {statsLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : <>
            <StatCard label="Total barriles" value={stats?.all ?? 0} icon={<Package className="h-5 w-5" />} />
            <StatCard label="En ruta" value={stats?.transporte ?? 0} icon={<Truck className="h-5 w-5" />} />
            <StatCard label="En bodega" value={stats?.bodega ?? 0} icon={<Warehouse className="h-5 w-5" />} />
            <StatCard label="Alertas activas" value={stats?.alertas ?? 0} icon={<Bell className="h-5 w-5" />} />
          </>
        }
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Active routes */}
        <div className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-700">Rutas activas hoy</h2>
            <Link href="/rutas" className="text-xs text-amber-600 hover:underline">Ver todas →</Link>
          </div>
          {routesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : routes?.items?.length === 0 ? (
            <p className="rounded-xl border bg-white py-10 text-center text-sm text-stone-400">
              Sin rutas activas
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {routes?.items?.map(route => (
                <RouteKanbanCard key={route.id} route={route} />
              ))}
            </div>
          )}
        </div>

        {/* Recent alerts */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-700">Alertas recientes</h2>
            <Link href="/alertas" className="text-xs text-amber-600 hover:underline">Ver todas →</Link>
          </div>
          <div className="space-y-2">
            {alerts?.items?.map(alert => (
              <div key={alert.id} className={`rounded-lg p-3 ${SEVERITY_BG[alert.severity] ?? ''}`}>
                <p className="text-xs font-medium text-stone-800 line-clamp-2">{alert.message}</p>
                <p className="mt-1 text-[10px] text-stone-400">{formatRelative(alert.createdAt)}</p>
              </div>
            ))}
            {!alerts?.items?.length && (
              <p className="rounded-xl border bg-white py-8 text-center text-sm text-stone-400">Sin alertas</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
