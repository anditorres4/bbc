'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckSquare, Loader2, AlertTriangle, Package } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

const STATUS_COLOR: Record<string, string> = {
  PLANIFICADA: 'bg-stone-100 text-stone-600',
  EN_CURSO: 'bg-blue-100 text-blue-700',
  COMPLETADA: 'bg-green-100 text-green-700',
  CON_NOVEDAD: 'bg-red-100 text-red-700',
  CANCELADA: 'bg-stone-200 text-stone-500',
}

const STOP_STATUS_COLOR: Record<string, string> = {
  PENDIENTE: 'bg-stone-100 text-stone-600',
  COMPLETADA: 'bg-green-100 text-green-700',
  CON_NOVEDAD: 'bg-red-100 text-red-700',
  CANCELADA: 'bg-stone-200 text-stone-500',
}

type StopAction = { type: 'entregar' | 'recoger' | 'novedad'; stopId: string } | null

export default function RutaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()

  const [stopAction, setStopAction] = useState<StopAction>(null)
  const [barrelIdInput, setBarrelIdInput] = useState('')
  const [novedadDesc, setNovedadDesc] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const { data: route, isLoading } = useQuery({
    queryKey: ['route', id],
    queryFn: () => api.get<{ data: Route }>(`/api/rutas/${id}`).then(r => r.data),
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
        const barrelIds = barrelIdInput.split(',').map(s => s.trim()).filter(Boolean)
        if (barrelIds.length === 0) {
          setActionError('Ingresa al menos un ID de barril')
          setActionLoading(false)
          return
        }
        const endpoint = stopAction.type === 'entregar' ? 'entregar' : 'recoger'
        await api.post(`/api/rutas/${id}/stops/${stopAction.stopId}/${endpoint}`, { barrelIds })
      }
      qc.invalidateQueries({ queryKey: ['route', id] })
      setStopAction(null)
      setBarrelIdInput('')
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

  const canClose = route.status === 'EN_CURSO' || route.status === 'CON_NOVEDAD'

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{route.name}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[route.status] ?? ''}`}>
                {STATUS_LABEL[route.status] ?? route.status}
              </span>
            </div>
            <p className="text-sm text-stone-400">
              {formatDate(route.date)} • {route.transportist?.name ?? 'Sin transportista'} • {route.vehiclePlate ?? 'Sin placa'}
            </p>
          </div>
        </div>
        {canClose && (
          <Button variant="outline" onClick={() => cerrarMutation.mutate()} disabled={cerrarMutation.isPending}>
            {cerrarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
            Cerrar ruta
          </Button>
        )}
      </div>

      {/* Stops */}
      <div className="space-y-3">
        {route.stops?.map((stop, idx) => {
          const totalRequired = stop.requirements?.reduce((s, r) => s + r.quantity, 0) ?? stop.totalBarrels
          const deliveredBarrels = stop.barrels?.filter(b => b.status === 'ENTREGADO') ?? []
          const pickedUpBarrels = stop.barrels?.filter(b => b.status === 'RECOGIDO_VACIO') ?? []
          const pct = totalRequired > 0 ? Math.round((stop.barrelsDelivered / totalRequired) * 100) : 0

          return (
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
              <CardContent className="space-y-4">
                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                    <span>Entregados</span>
                    <span>{stop.barrelsDelivered}/{totalRequired} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-stone-100">
                    <div
                      className="h-1.5 rounded-full bg-amber-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Requirements */}
                {stop.requirements && stop.requirements.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Requerimientos</p>
                    {stop.requirements.map(req => {
                      const delivered = deliveredBarrels.filter(b => b.product === req.product).length
                      return (
                        <div key={req.id} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Package className="h-3.5 w-3.5 text-stone-400" />
                            <span>{req.product}</span>
                          </div>
                          <span className={`text-xs font-medium ${delivered >= req.quantity ? 'text-green-600' : 'text-stone-500'}`}>
                            {delivered}/{req.quantity}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Delivered barrels */}
                {deliveredBarrels.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Barriles entregados</p>
                    {deliveredBarrels.map(b => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-1.5 text-xs">
                        <span className="font-medium">{b.barrel?.id ?? b.barrelId}</span>
                        <span className="text-stone-500">{b.product}</span>
                        <Badge variant="outline" className="text-green-700 border-green-200">Entregado</Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Picked up barrels */}
                {pickedUpBarrels.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Vacíos recogidos</p>
                    {pickedUpBarrels.map(b => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-1.5 text-xs">
                        <span className="font-medium">{b.barrel?.id ?? b.barrelId}</span>
                        <span className="text-stone-500">{b.product}</span>
                        <Badge variant="outline" className="text-blue-700 border-blue-200">Recogido</Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Stop actions (admin override) */}
                {(route.status === 'EN_CURSO' || route.status === 'CON_NOVEDAD') && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    {stop.status !== 'COMPLETADA' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setStopAction({ type: 'entregar', stopId: stop.id }); setBarrelIdInput('') }}
                        >
                          Registrar entrega
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setStopAction({ type: 'recoger', stopId: stop.id }); setBarrelIdInput('') }}
                        >
                          Registrar recogida
                        </Button>
                      </>
                    )}
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
          )
        })}
      </div>

      {/* Action dialog */}
      <Dialog open={!!stopAction} onOpenChange={open => !open && setStopAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {stopAction?.type === 'entregar' ? 'Registrar entrega' :
               stopAction?.type === 'recoger' ? 'Registrar recogida de vacíos' : 'Reportar novedad'}
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
              <div className="space-y-1.5">
                <Label>IDs de barriles (separados por coma)</Label>
                <Input
                  value={barrelIdInput}
                  onChange={e => setBarrelIdInput(e.target.value)}
                  placeholder="BBC-001, BBC-002, …"
                />
                <p className="text-xs text-stone-400">Ingresa los IDs de los barriles a {stopAction?.type === 'entregar' ? 'entregar' : 'recoger'}</p>
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
