'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Play, CheckSquare, Loader2, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { BarrelStatusBadge } from '@/components/BarrelStatusBadge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { Route } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  PLANIFICADA: 'Planificada',
  EN_CURSO: 'En curso',
  COMPLETADA: 'Completada',
  CON_NOVEDAD: 'Con novedad',
  CANCELADA: 'Cancelada',
}

const STOP_STATUS_COLOR: Record<string, string> = {
  PENDIENTE: 'bg-stone-100 text-stone-600',
  COMPLETADA: 'bg-green-100 text-green-700',
  CON_NOVEDAD: 'bg-red-100 text-red-700',
}

type StopAction = { type: 'entregar' | 'recoger' | 'novedad'; stopId: string } | null

export default function RutaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()

  const [stopAction, setStopAction] = useState<StopAction>(null)
  const [selectedBarrels, setSelectedBarrels] = useState<string[]>([])
  const [novedadDesc, setNovedadDesc] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const { data: route, isLoading } = useQuery({
    queryKey: ['route', id],
    queryFn: () => api.get<{ data: Route }>(`/api/rutas/${id}`).then(r => r.data),
  })

  const iniciarMutation = useMutation({
    mutationFn: () => api.post(`/api/rutas/${id}/iniciar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['route', id] }),
  })

  const cerrarMutation = useMutation({
    mutationFn: () => api.post(`/api/rutas/${id}/cerrar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['route', id] }),
  })

  async function executeStopAction() {
    if (!stopAction) return
    setActionError(null)
    setActionLoading(true)
    try {
      if (stopAction.type === 'novedad') {
        await api.post(`/api/rutas/${id}/stops/${stopAction.stopId}/novedad`, { description: novedadDesc })
      } else {
        const endpoint = stopAction.type === 'entregar' ? 'entregar' : 'recoger'
        await api.post(`/api/rutas/${id}/stops/${stopAction.stopId}/${endpoint}`, { barrelIds: selectedBarrels })
      }
      qc.invalidateQueries({ queryKey: ['route', id] })
      setStopAction(null)
      setSelectedBarrels([])
      setNovedadDesc('')
    } catch (err: unknown) {
      const e = err as { message?: string }
      setActionError(e?.message ?? 'Error al ejecutar acción')
    } finally {
      setActionLoading(false)
    }
  }

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-80" /></div>
  }

  if (!route) return null

  const currentStop = stopAction
    ? route.stops?.find(s => s.id === stopAction.stopId)
    : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{route.name}</h2>
              <Badge className={STATUS_LABEL[route.status] ? 'bg-stone-100 text-stone-700' : ''}>
                {STATUS_LABEL[route.status] ?? route.status}
              </Badge>
            </div>
            <p className="text-sm text-stone-400">
              {formatDate(route.date)} • {route.transportist?.name} • {route.vehiclePlate ?? 'Sin placa'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {route.status === 'PLANIFICADA' && (
            <Button onClick={() => iniciarMutation.mutate()} disabled={iniciarMutation.isPending}>
              {iniciarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Iniciar ruta
            </Button>
          )}
          {route.status === 'EN_CURSO' && (
            <Button variant="outline" onClick={() => cerrarMutation.mutate()} disabled={cerrarMutation.isPending}>
              {cerrarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
              Cerrar ruta
            </Button>
          )}
        </div>
      </div>

      {/* Stops */}
      <div className="space-y-3">
        {route.stops?.map((stop, idx) => (
          <Card key={stop.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  Parada {idx + 1} — {stop.deliveryPoint?.name ?? stop.deliveryPointId}
                </CardTitle>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STOP_STATUS_COLOR[stop.status] ?? ''}`}>
                  {stop.status}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span>Barriles entregados</span>
                  <span>{stop.barrelsDelivered}/{stop.totalBarrels}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-stone-100">
                  <div
                    className="h-1.5 rounded-full bg-amber-500"
                    style={{ width: `${stop.totalBarrels > 0 ? (stop.barrelsDelivered / stop.totalBarrels) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Barrels list */}
              {stop.barrels && stop.barrels.length > 0 && (
                <div className="mb-3 space-y-1">
                  {stop.barrels.map(b => (
                    <div key={b.id} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-1.5 text-xs">
                      <span className="font-medium">{b.barrel?.id ?? b.barrelId}</span>
                      <span className="text-stone-400">{b.product}</span>
                      <BarrelStatusBadge status={b.status as Parameters<typeof BarrelStatusBadge>[0]['status']} />
                    </div>
                  ))}
                </div>
              )}

              {/* Stop actions */}
              {route.status === 'EN_CURSO' && stop.status === 'PENDIENTE' && (
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setStopAction({ type: 'entregar', stopId: stop.id })
                      setSelectedBarrels(stop.barrels?.map(b => b.barrelId) ?? [])
                    }}
                  >
                    Entregar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setStopAction({ type: 'recoger', stopId: stop.id })
                      setSelectedBarrels(stop.barrels?.map(b => b.barrelId) ?? [])
                    }}
                  >
                    Recoger vacíos
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStopAction({ type: 'novedad', stopId: stop.id })}
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Novedad
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action dialog */}
      <Dialog open={!!stopAction} onOpenChange={open => !open && setStopAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {stopAction?.type === 'entregar' ? 'Confirmar entrega' :
               stopAction?.type === 'recoger' ? 'Confirmar recogida' : 'Reportar novedad'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {stopAction?.type === 'novedad' ? (
              <div className="space-y-1.5">
                <Label>Descripción de la novedad</Label>
                <Textarea
                  value={novedadDesc}
                  onChange={e => setNovedadDesc(e.target.value)}
                  placeholder="Describa la novedad…"
                  rows={3}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Barriles seleccionados</Label>
                {currentStop?.barrels?.map(b => (
                  <label key={b.barrelId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedBarrels.includes(b.barrelId)}
                      onChange={e => {
                        if (e.target.checked) setSelectedBarrels(prev => [...prev, b.barrelId])
                        else setSelectedBarrels(prev => prev.filter(id => id !== b.barrelId))
                      }}
                    />
                    <span>{b.barrel?.id ?? b.barrelId}</span>
                    <span className="text-stone-400">{b.product}</span>
                  </label>
                ))}
              </div>
            )}
            {actionError && <p className="text-xs text-red-500">{actionError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStopAction(null)}>Cancelar</Button>
              <Button onClick={executeStopAction} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
