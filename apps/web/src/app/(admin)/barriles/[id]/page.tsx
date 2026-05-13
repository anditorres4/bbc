'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Wrench, RotateCcw, Ban, Package } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { api } from '@/lib/api'
import { BarrelStatusBadge } from '@/components/BarrelStatusBadge'
import { BarrelTimeline } from '@/components/BarrelTimeline'
import { QRDisplay } from '@/components/QRDisplay'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import type { BarrelDetail } from '@/lib/types'

type ActionType = 'mantenimiento' | 'retorno' | 'baja' | 'recibir' | null

export default function BarrilDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()

  const [action, setAction] = useState<ActionType>(null)
  const [notes, setNotes] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: barrel, isLoading } = useQuery({
    queryKey: ['barrel', id],
    queryFn: () => api.get<{ data: BarrelDetail }>(`/api/barriles/${id}`).then(r => r.data),
  })

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{
    capacity?: number
    product?: string
    notes?: string
  }>()

  const updateMutation = useMutation({
    mutationFn: (data: object) => api.patch(`/api/barriles/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['barrel', id] }),
  })

  async function executeAction() {
    setActionError(null)
    const endpoints: Record<string, string> = {
      mantenimiento: `/api/barriles/${id}/mantenimiento`,
      retorno: `/api/barriles/${id}/retorno-mantenimiento`,
      baja: `/api/barriles/${id}/baja`,
      recibir: `/api/barriles/${id}/recibir`,
    }
    try {
      await api.post(endpoints[action!], { notes })
      qc.invalidateQueries({ queryKey: ['barrel', id] })
      setAction(null)
      setNotes('')
    } catch (err: unknown) {
      const e = err as { message?: string }
      setActionError(e?.message ?? 'Error al ejecutar acción')
    }
  }

  const ACTION_CONFIG: Record<string, { label: string; Icon: typeof Wrench; variant: string }> = {
    mantenimiento: { label: 'Enviar a mantenimiento', Icon: Wrench, variant: 'outline' },
    retorno: { label: 'Retorno de mantenimiento', Icon: RotateCcw, variant: 'outline' },
    baja: { label: 'Dar de baja', Icon: Ban, variant: 'destructive' },
    recibir: { label: 'Recibir en bodega', Icon: Package, variant: 'outline' },
  }

  const availableActions: ActionType[] = (() => {
    if (!barrel) return []
    const s = barrel.status
    const acts: ActionType[] = []
    if (s === 'EN_BODEGA') acts.push('mantenimiento')
    if (s === 'EN_MANTENIMIENTO') acts.push('retorno')
    if (s === 'EN_RECOGIDA' || s === 'DEVUELTO') acts.push('recibir')
    if (s !== 'BAJA') acts.push('baja')
    return acts
  })()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  if (!barrel) return null

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{barrel.id}</h2>
          <BarrelStatusBadge status={barrel.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Left: data + actions + QR */}
        <div className="space-y-4">
          {/* Edit metadata */}
          <Card>
            <CardHeader><CardTitle>Información</CardTitle></CardHeader>
            <CardContent>
              <form
                onSubmit={handleSubmit(data => updateMutation.mutate(data))}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Capacidad (L)</Label>
                    <Input type="number" defaultValue={barrel.capacity} {...register('capacity', { valueAsNumber: true })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Producto</Label>
                    <Input defaultValue={barrel.product ?? ''} {...register('product')} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notas</Label>
                  <Textarea defaultValue={barrel.notes ?? ''} {...register('notes')} />
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs text-stone-400">
                  <span>Fabricación: {formatDate(barrel.manufactureDate)}</span>
                  {barrel.lastMaintenanceDate && (
                    <span>Último mant: {formatDate(barrel.lastMaintenanceDate)}</span>
                  )}
                </div>
                <Button type="submit" size="sm" disabled={isSubmitting || updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar cambios'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Action buttons */}
          {availableActions.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Acciones</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {availableActions.map(act => {
                    const cfg = ACTION_CONFIG[act!]
                    return (
                      <Button
                        key={act}
                        variant={cfg.variant as 'outline' | 'destructive'}
                        size="sm"
                        onClick={() => setAction(act)}
                      >
                        <cfg.Icon className="h-4 w-4" />
                        {cfg.label}
                      </Button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* QR */}
          <QRDisplay
            barrelId={id}
            productName={barrel.product ?? undefined}
            currentStatus={barrel.status}
          />
        </div>

        {/* Right: timeline */}
        <Card>
          <CardHeader><CardTitle>Historial de eventos</CardTitle></CardHeader>
          <CardContent>
            <BarrelTimeline events={barrel.events ?? []} />
          </CardContent>
        </Card>
      </div>

      {/* Action confirm dialog */}
      <Dialog open={!!action} onOpenChange={open => !open && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action ? ACTION_CONFIG[action]?.label : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Notas (opcional)</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observaciones…"
              />
            </div>
            {actionError && <p className="text-xs text-red-500">{actionError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAction(null)}>Cancelar</Button>
              <Button
                variant={action === 'baja' ? 'destructive' : 'default'}
                onClick={executeAction}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
