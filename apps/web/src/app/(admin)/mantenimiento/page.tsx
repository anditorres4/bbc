'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wrench, RotateCcw, Loader2 } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BarrelStatusBadge } from '@/components/BarrelStatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import type { Barrel, PaginatedResponse } from '@/lib/types'

export default function MantenimientoPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['barriles-mantenimiento'],
    queryFn: () =>
      api.get<PaginatedResponse<Barrel>>('/api/barriles?status=EN_MANTENIMIENTO&pageSize=100'),
  })

  const retornoMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.post(`/api/barriles/${id}/retorno-mantenimiento`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['barriles-mantenimiento'] })
      setSelectedId(null)
      setNotes('')
      setActionError(null)
    },
    onError: (err: unknown) => {
      const e = err as { message?: string }
      setActionError(e?.message ?? 'Error al procesar retorno')
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Wrench className="h-6 w-6 text-orange-500" />
        <h1 className="text-xl font-bold text-stone-900">Mantenimiento</h1>
        {data && (
          <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
            {data.total} en taller
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-10 text-center">
          <Wrench className="mx-auto mb-3 h-8 w-8 text-green-400" />
          <p className="font-medium text-green-700">Sin barriles en mantenimiento</p>
          <p className="text-sm text-green-500 mt-1">Todos los barriles están disponibles</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-stone-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-stone-500">ID</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Producto</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Capacidad</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Fabricación</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Último mant.</th>
                <th className="px-4 py-3 text-right font-medium text-stone-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map(barrel => (
                <tr key={barrel.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/barriles/${barrel.id}`} className="font-medium text-amber-700 hover:underline">
                      {barrel.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{barrel.product ?? '—'}</td>
                  <td className="px-4 py-3 text-stone-600">{barrel.capacity} L</td>
                  <td className="px-4 py-3 text-stone-500">{formatDate(barrel.manufactureDate)}</td>
                  <td className="px-4 py-3 text-stone-500">
                    {barrel.lastMaintenanceDate ? formatDate(barrel.lastMaintenanceDate) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
                      onClick={() => { setSelectedId(barrel.id); setNotes(''); setActionError(null) }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Retorno a bodega
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Also show EN_BODEGA barrels to send to maintenance */}
      <BodegaParaMantenimiento />

      {/* Confirm retorno dialog */}
      <Dialog open={!!selectedId} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar retorno de mantenimiento — {selectedId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-stone-500">
              El barril volverá al estado <BarrelStatusBadge status="EN_BODEGA" /> y se actualizará la fecha de último mantenimiento.
            </p>
            <div className="space-y-1.5">
              <Label>Notas del mantenimiento (opcional)</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observaciones del taller…"
                rows={3}
              />
            </div>
            {actionError && <p className="text-xs text-red-500">{actionError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedId(null)}>Cancelar</Button>
              <Button
                onClick={() => selectedId && retornoMutation.mutate({ id: selectedId, notes })}
                disabled={retornoMutation.isPending}
              >
                {retornoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar retorno'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BodegaParaMantenimiento() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data } = useQuery({
    queryKey: ['barriles-bodega-mant'],
    queryFn: () =>
      api.get<PaginatedResponse<Barrel>>('/api/barriles?status=EN_BODEGA&pageSize=100'),
  })

  const enviarMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.post(`/api/barriles/${id}/mantenimiento`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['barriles-bodega-mant'] })
      qc.invalidateQueries({ queryKey: ['barriles-mantenimiento'] })
      setSelectedId(null)
      setNotes('')
      setActionError(null)
    },
    onError: (err: unknown) => {
      const e = err as { message?: string }
      setActionError(e?.message ?? 'Error al enviar a mantenimiento')
    },
  })

  const filtered = data?.items.filter(b =>
    !search || b.id.toLowerCase().includes(search.toLowerCase()) || (b.product ?? '').toLowerCase().includes(search.toLowerCase())
  ) ?? []

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wide">Enviar barril a mantenimiento</h2>
          <input
            type="text"
            placeholder="Buscar por ID o producto…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 rounded-lg border border-stone-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 w-56"
          />
        </div>
        {filtered.length > 0 && (
          <div className="rounded-xl border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-stone-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-stone-500">ID</th>
                  <th className="px-4 py-2.5 text-left font-medium text-stone-500">Producto</th>
                  <th className="px-4 py-2.5 text-left font-medium text-stone-500">Capacidad</th>
                  <th className="px-4 py-2.5 text-right font-medium text-stone-500">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.slice(0, 20).map(barrel => (
                  <tr key={barrel.id} className="hover:bg-stone-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/barriles/${barrel.id}`} className="font-medium text-amber-700 hover:underline">
                        {barrel.id}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-stone-600">{barrel.product ?? '—'}</td>
                    <td className="px-4 py-2.5 text-stone-600">{barrel.capacity} L</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => { setSelectedId(barrel.id); setNotes(''); setActionError(null) }}
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        Enviar a taller
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!selectedId} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar a mantenimiento — {selectedId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Motivo / Notas (opcional)</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Motivo del mantenimiento…"
                rows={3}
              />
            </div>
            {actionError && <p className="text-xs text-red-500">{actionError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedId(null)}>Cancelar</Button>
              <Button
                onClick={() => selectedId && enviarMutation.mutate({ id: selectedId, notes })}
                disabled={enviarMutation.isPending}
              >
                {enviarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
