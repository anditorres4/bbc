'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  BarChart2, Package, Truck, Bell, AlertTriangle,
  CheckCircle2, MapPin, TrendingUp,
} from 'lucide-react'

interface ReportData {
  barrilesXEstado: { status: string; count: number }[]
  barrilesXProducto: { product: string; count: number }[]
  rutasPorDia: { date: string; total: number; completadas: number; canceladas: number; conNovedad: number }[]
  topPuntosEntrega: { name: string; address: string; totalEntregas: number; totalRecogidas: number; visitasCompletadas: number }[]
  alertasPorSeveridad: { severity: string; count: number }[]
  summary: { totalBarrels: number; activeRoutes: number; unreadAlerts: number; sinMovimiento60d: number }
}

const STATUS_LABELS: Record<string, string> = {
  EN_BODEGA: 'En bodega',
  EN_ALISTAMIENTO: 'En alistamiento',
  EN_TRANSPORTE: 'En transporte',
  ENTREGADO: 'Entregado',
  EN_RECOGIDA: 'En recogida',
  DEVUELTO: 'Devuelto',
  EN_MANTENIMIENTO: 'Mantenimiento',
  BAJA: 'Baja',
}

const STATUS_COLORS: Record<string, string> = {
  EN_BODEGA: 'bg-stone-400',
  EN_ALISTAMIENTO: 'bg-amber-400',
  EN_TRANSPORTE: 'bg-blue-500',
  ENTREGADO: 'bg-green-500',
  EN_RECOGIDA: 'bg-purple-500',
  DEVUELTO: 'bg-teal-500',
  EN_MANTENIMIENTO: 'bg-orange-500',
  BAJA: 'bg-red-500',
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: 'Crítica', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  WARNING: { label: 'Advertencia', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  INFO: { label: 'Información', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
}

function SummaryCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  sub?: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border bg-white p-5 flex items-start gap-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent ?? 'bg-amber-100'}`}>
        <Icon className={`h-5 w-5 ${accent ? 'text-white' : 'text-amber-700'}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-stone-900">{value}</p>
        <p className="text-sm font-medium text-stone-700">{label}</p>
        {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function HBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-2.5 w-full rounded-full bg-stone-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function ReportesPage() {
  const { data, isLoading, isError } = useQuery<ReportData>({
    queryKey: ['reportes'],
    queryFn: () => api.get<ReportData>('/api/reportes'),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
        No se pudieron cargar los reportes.
      </div>
    )
  }

  const totalBarrels = data.barrilesXEstado.reduce((n, r) => n + r.count, 0)
  const maxStatus = Math.max(...data.barrilesXEstado.map(r => r.count), 1)
  const maxProduct = Math.max(...data.barrilesXProducto.map(r => r.count), 1)
  const maxEntregas = Math.max(...data.topPuntosEntrega.map(r => r.totalEntregas), 1)

  // Last 14 days of route data for mini-chart
  const last14 = data.rutasPorDia.slice(-14)
  const maxRoutes = Math.max(...last14.map(r => r.total), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart2 className="h-6 w-6 text-amber-600" />
        <h1 className="text-xl font-bold text-stone-900">Reportes</h1>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard icon={Package} label="Barriles registrados" value={data.summary.totalBarrels} />
        <SummaryCard icon={Truck} label="Rutas activas" value={data.summary.activeRoutes} accent="bg-blue-500" />
        <SummaryCard icon={Bell} label="Alertas sin leer" value={data.summary.unreadAlerts} accent={data.summary.unreadAlerts > 0 ? 'bg-red-500' : 'bg-stone-400'} />
        <SummaryCard icon={AlertTriangle} label="Sin movimiento 60d" value={data.summary.sinMovimiento60d} sub="barriles fuera de bodega" accent={data.summary.sinMovimiento60d > 0 ? 'bg-orange-500' : 'bg-stone-400'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Barriles por estado */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-stone-700 uppercase tracking-wide">
            <Package className="h-4 w-4 text-amber-600" />
            Barriles por estado
          </h2>
          <div className="space-y-3">
            {data.barrilesXEstado.map(row => (
              <div key={row.status}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_COLORS[row.status] ?? 'bg-stone-400'}`} />
                    <span className="font-medium text-stone-700">{STATUS_LABELS[row.status] ?? row.status}</span>
                  </span>
                  <span className="text-stone-500">{row.count} <span className="text-xs text-stone-400">({totalBarrels > 0 ? Math.round(row.count / totalBarrels * 100) : 0}%)</span></span>
                </div>
                <HBar value={row.count} max={maxStatus} colorClass={STATUS_COLORS[row.status]?.replace('bg-', 'bg-') ?? 'bg-stone-400'} />
              </div>
            ))}
            {data.barrilesXEstado.length === 0 && (
              <p className="text-center text-sm text-stone-400 py-4">Sin datos</p>
            )}
          </div>
        </div>

        {/* Barriles por producto */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-stone-700 uppercase tracking-wide">
            <TrendingUp className="h-4 w-4 text-amber-600" />
            Barriles por producto
          </h2>
          <div className="space-y-3">
            {data.barrilesXProducto.map(row => (
              <div key={row.product}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-stone-700 truncate max-w-[60%]">{row.product}</span>
                  <span className="text-stone-500">{row.count}</span>
                </div>
                <HBar value={row.count} max={maxProduct} colorClass="bg-amber-500" />
              </div>
            ))}
            {data.barrilesXProducto.length === 0 && (
              <p className="text-center text-sm text-stone-400 py-4">Sin barriles con producto asignado</p>
            )}
          </div>
        </div>

        {/* Rutas por día — últimos 14 días */}
        <div className="rounded-xl border bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-stone-700 uppercase tracking-wide">
            <Truck className="h-4 w-4 text-amber-600" />
            Rutas — últimos 14 días
          </h2>
          {last14.length === 0 ? (
            <p className="text-center text-sm text-stone-400 py-4">Sin rutas recientes</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1.5 min-w-0" style={{ minWidth: last14.length * 44 }}>
                {last14.map(day => {
                  const barH = maxRoutes > 0 ? Math.max(4, Math.round((day.total / maxRoutes) * 80)) : 4
                  const doneH = day.total > 0 ? Math.round((day.completadas / day.total) * barH) : 0
                  const label = new Date(day.date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
                  return (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-1 min-w-[36px]">
                      <span className="text-xs font-semibold text-stone-600">{day.total}</span>
                      <div className="relative w-full flex flex-col justify-end" style={{ height: 80 }}>
                        <div className="w-full rounded-t-sm bg-stone-200" style={{ height: barH }}>
                          <div
                            className="w-full rounded-t-sm bg-green-500 transition-all"
                            style={{ height: doneH }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-stone-400 text-center leading-tight">{label}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-stone-500">
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" /> Completadas</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-stone-200" /> Total</span>
              </div>
            </div>
          )}
        </div>

        {/* Trazabilidad por punto de entrega */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-stone-700 uppercase tracking-wide">
            <MapPin className="h-4 w-4 text-amber-600" />
            Puntos de entrega
          </h2>
          <div className="space-y-4">
            {data.topPuntosEntrega.map(dp => (
              <div key={dp.name} className="border-b pb-4 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-stone-800 text-sm">{dp.name}</p>
                    {dp.address && <p className="text-xs text-stone-400">{dp.address}</p>}
                  </div>
                  <span className="text-xs text-stone-400 whitespace-nowrap">{dp.visitasCompletadas} visitas</span>
                </div>
                <div className="mt-2">
                  <div className="mb-1">
                    <div className="flex justify-between text-xs text-stone-500 mb-0.5">
                      <span>Entregas</span><span>{dp.totalEntregas}</span>
                    </div>
                    <HBar value={dp.totalEntregas} max={maxEntregas} colorClass="bg-amber-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-stone-500 mb-0.5">
                      <span>Recogidas vacío</span><span>{dp.totalRecogidas}</span>
                    </div>
                    <HBar value={dp.totalRecogidas} max={maxEntregas} colorClass="bg-purple-500" />
                  </div>
                </div>
              </div>
            ))}
            {data.topPuntosEntrega.length === 0 && (
              <p className="text-center text-sm text-stone-400 py-4">Sin datos de puntos de entrega</p>
            )}
          </div>
        </div>

        {/* Alertas por severidad */}
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-stone-700 uppercase tracking-wide">
            <Bell className="h-4 w-4 text-amber-600" />
            Alertas — últimos 30 días
          </h2>
          <div className="space-y-3">
            {data.alertasPorSeveridad.map(row => {
              const cfg = SEVERITY_CONFIG[row.severity] ?? { label: row.severity, color: 'text-stone-700', bg: 'bg-stone-50 border-stone-200' }
              return (
                <div key={row.severity} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${cfg.bg}`}>
                  <span className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</span>
                  <span className={`text-2xl font-bold ${cfg.color}`}>{row.count}</span>
                </div>
              )
            })}
            {data.alertasPorSeveridad.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-700">Sin alertas en los últimos 30 días</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
