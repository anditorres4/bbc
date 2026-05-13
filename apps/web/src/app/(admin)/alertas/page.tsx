'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, Filter } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelative } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Alert, PaginatedResponse, AlertSeverity } from '@/lib/types'

const SEVERITY_GROUPS: AlertSeverity[] = ['CRITICAL', 'WARNING', 'INFO']
const SEVERITY_LABEL: Record<AlertSeverity, string> = { CRITICAL: 'Crítico', WARNING: 'Advertencia', INFO: 'Info' }
const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  CRITICAL: 'border-l-4 border-red-500 bg-red-50',
  WARNING: 'border-l-4 border-amber-400 bg-amber-50',
  INFO: 'border-l-4 border-stone-300 bg-stone-50',
}
const SEVERITY_DOT: Record<AlertSeverity, string> = {
  CRITICAL: 'bg-red-500',
  WARNING: 'bg-amber-400',
  INFO: 'bg-stone-400',
}

export default function AlertasPage() {
  const qc = useQueryClient()
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const [filterRead, setFilterRead] = useState<string>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', 'list', filterSeverity, filterRead, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '50' })
      if (filterSeverity !== 'all') params.set('severity', filterSeverity)
      if (filterRead !== 'all') params.set('isRead', filterRead)
      return api.get<PaginatedResponse<Alert>>(`/api/alertas?${params}`)
    },
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/alertas/${id}/leer`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  async function markAllRead() {
    const unread = data?.items?.filter(a => !a.isRead) ?? []
    await Promise.all(unread.map(a => markReadMutation.mutateAsync(a.id)))
  }

  const grouped = SEVERITY_GROUPS.reduce<Record<AlertSeverity, Alert[]>>((acc, sev) => {
    acc[sev] = (data?.items ?? []).filter(a =>
      (filterSeverity === 'all' || a.severity === filterSeverity) && a.severity === sev
    )
    return acc
  }, { CRITICAL: [], WARNING: [], INFO: [] })

  const unreadCount = data?.items?.filter(a => !a.isRead).length ?? 0

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-stone-400" />
          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="CRITICAL">Críticas</SelectItem>
              <SelectItem value="WARNING">Advertencias</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterRead} onValueChange={setFilterRead}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="false">Sin leer</SelectItem>
              <SelectItem value="true">Leídas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" />
            Marcar todas leídas ({unreadCount})
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : data?.total === 0 ? (
        <div className="py-16 text-center text-stone-400">Sin alertas con los filtros seleccionados</div>
      ) : (
        SEVERITY_GROUPS.map(sev => {
          const alerts = grouped[sev]
          if (alerts.length === 0) return null
          return (
            <div key={sev}>
              <div className="mb-2 flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', SEVERITY_DOT[sev])} />
                <h3 className="text-sm font-semibold text-stone-700">{SEVERITY_LABEL[sev]}</h3>
                <span className="text-xs text-stone-400">({alerts.length})</span>
              </div>
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={cn(
                      'flex items-start justify-between rounded-lg p-4',
                      SEVERITY_COLOR[alert.severity],
                      alert.isRead && 'opacity-60'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-800">{alert.message}</p>
                      <div className="mt-1 flex gap-3 text-[10px] text-stone-400">
                        <span>{formatRelative(alert.createdAt)}</span>
                        {alert.barrel && <span>Barril: {alert.barrel.id}</span>}
                        {alert.route && <span>Ruta: {alert.route.name}</span>}
                      </div>
                    </div>
                    {!alert.isRead && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-3 shrink-0 text-xs"
                        onClick={() => markReadMutation.mutate(alert.id)}
                      >
                        Marcar leída
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}

      {(data?.totalPages ?? 0) > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="flex items-center text-xs text-stone-500">Pág {page} de {data?.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
        </div>
      )}
    </div>
  )
}
