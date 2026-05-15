'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getLocalDateInputValue } from '@/lib/utils'
import type { AuditLog, PaginatedResponse } from '@/lib/types'

const ACTION_LABELS: Record<string, string> = {
  BARREL_MANTENIMIENTO: 'Envío a mantenimiento',
  BARREL_RETORNO_MANTENIMIENTO: 'Retorno de mantenimiento',
  BARREL_BAJA: 'Baja de barril',
  ROUTE_CREATED: 'Ruta creada',
  ROUTE_CERRADA: 'Ruta cerrada',
}

const ACTION_COLORS: Record<string, string> = {
  BARREL_MANTENIMIENTO: 'bg-orange-100 text-orange-700',
  BARREL_RETORNO_MANTENIMIENTO: 'bg-green-100 text-green-700',
  BARREL_BAJA: 'bg-red-100 text-red-700',
  ROUTE_CREATED: 'bg-blue-100 text-blue-700',
  ROUTE_CERRADA: 'bg-purple-100 text-purple-700',
}

const ENTITY_LABELS: Record<string, string> = {
  barrel: 'Barril',
  route: 'Ruta',
}

function getDefaults() {
  const to = getLocalDateInputValue(new Date())
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - 30)
  return { from: getLocalDateInputValue(fromDate), to }
}

export default function AuditoriaPage() {
  const defaults = getDefaults()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [entityType, setEntityType] = useState('')
  const [appliedFilters, setAppliedFilters] = useState({ from: defaults.from, to: defaults.to, entityType: '' })
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['auditoria', appliedFilters, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '50',
        from: appliedFilters.from,
        to: appliedFilters.to,
        ...(appliedFilters.entityType ? { entityType: appliedFilters.entityType } : {}),
      })
      return api.get<PaginatedResponse<AuditLog>>(`/api/auditoria?${params}`)
    },
  })

  function applyFilters() {
    setAppliedFilters({ from, to, entityType })
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-bold text-stone-900">Auditoría</h1>
        {data && (
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {data.total} registros
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <div className="space-y-1">
          <Label className="text-xs text-stone-500">Desde</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-sm w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-stone-500">Hasta</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-sm w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-stone-500">Entidad</Label>
          <select
            value={entityType}
            onChange={e => setEntityType(e.target.value)}
            className="h-8 rounded-lg border border-stone-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Todas</option>
            <option value="barrel">Barriles</option>
            <option value="route">Rutas</option>
          </select>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={applyFilters}>
          Aplicar
        </Button>
      </div>

      {/* Log table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-10 text-center text-stone-400">
          Sin registros de auditoría en este período
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-stone-50">
                <tr>
                  <th className="w-8 px-4 py-3" />
                  <th className="px-4 py-3 text-left font-medium text-stone-500">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-stone-500">Usuario</th>
                  <th className="px-4 py-3 text-left font-medium text-stone-500">Acción</th>
                  <th className="px-4 py-3 text-left font-medium text-stone-500">Entidad</th>
                  <th className="px-4 py-3 text-left font-medium text-stone-500">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map(log => (
                  <>
                    <tr
                      key={log.id}
                      className="hover:bg-stone-50 cursor-pointer"
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-3 text-stone-400">
                        {expanded === log.id
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-3 text-stone-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-stone-800">{log.user?.name ?? log.userId}</span>
                        {log.user?.role && (
                          <span className="ml-1.5 text-xs text-stone-400">{log.user.role}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[log.action] ?? 'bg-stone-100 text-stone-600'}`}>
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-stone-500">{ENTITY_LABELS[log.entityType] ?? log.entityType}</span>
                        <span className="ml-1.5 font-mono text-xs text-amber-700">{log.entityId}</span>
                      </td>
                      <td className="px-4 py-3 text-stone-400 text-xs">{log.ip ?? '—'}</td>
                    </tr>
                    {expanded === log.id && log.changes && (
                      <tr key={`${log.id}-exp`} className="bg-stone-50">
                        <td colSpan={6} className="px-8 py-3">
                          <pre className="text-xs text-stone-600 overflow-x-auto">
                            {JSON.stringify(log.changes, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-stone-500">
              <span>Página {page} de {data.totalPages} ({data.total} registros)</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  Anterior
                </Button>
                <Button size="sm" variant="outline" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
