'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, QrCode, Search, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { api } from '@/lib/api'
import { DataTable } from '@/components/DataTable'
import { BarrelStatusBadge } from '@/components/BarrelStatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import type { Barrel, PaginatedResponse, BarrelStatus } from '@/lib/types'

const STATUSES: { value: BarrelStatus; label: string }[] = [
  { value: 'EN_BODEGA', label: 'En Bodega' },
  { value: 'EN_ALISTAMIENTO', label: 'En Alistamiento' },
  { value: 'EN_TRANSPORTE', label: 'En Transporte' },
  { value: 'ENTREGADO', label: 'Entregado' },
  { value: 'EN_RECOGIDA', label: 'En Recogida' },
  { value: 'DEVUELTO', label: 'Devuelto' },
  { value: 'EN_MANTENIMIENTO', label: 'Mantenimiento' },
  { value: 'BAJA', label: 'Baja' },
]

export default function BarrilesPage() {
  const router = useRouter()
  const qc = useQueryClient()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanOpen, setScanOpen] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  const { register, handleSubmit, reset } = useForm<{ qrCode: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ['barrels', page, search, status],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' })
      if (search) params.set('search', search)
      if (status) params.set('status', status)
      return api.get<PaginatedResponse<Barrel>>(`/api/barriles?${params}`)
    },
  })

  async function onScan({ qrCode }: { qrCode: string }) {
    setScanError(null)
    setScanning(true)
    try {
      const res = await api.post<{ barrel: Barrel; created: boolean }>('/api/barriles/scan', { qrCode })
      qc.invalidateQueries({ queryKey: ['barrels'] })
      setScanOpen(false)
      reset()
      router.push(`/barriles/${res.barrel.id}`)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setScanError(e?.message ?? 'Error al escanear')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              placeholder="Buscar ID o QR…"
              className="pl-9"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => { setSearch(''); setPage(1) }}>
                <X className="h-4 w-4 text-stone-400" />
              </button>
            )}
          </div>
          <Select value={status} onValueChange={v => { setStatus(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button
              variant="outline"
              onClick={() => router.push(`/barriles/etiquetas?ids=${[...selected].join(',')}`)}
            >
              <QrCode className="h-4 w-4" />
              Generar etiquetas ({selected.size})
            </Button>
          )}
          <Button onClick={() => setScanOpen(true)}>
            <Plus className="h-4 w-4" />
            Nuevo Barril
          </Button>
        </div>
      </div>

      {/* Table */}
      <DataTable<Barrel & Record<string, unknown>>
        loading={isLoading}
        data={(data?.items ?? []) as (Barrel & Record<string, unknown>)[]}
        pagination={data ? { page, totalPages: data.totalPages, onPageChange: setPage } : undefined}
        onRowClick={row => router.push(`/barriles/${row.id}`)}
        emptyMessage="No hay barriles con los filtros seleccionados"
        columns={[
          {
            key: 'select',
            header: '',
            className: 'w-10',
            render: (row) => (
              <input
                type="checkbox"
                checked={selected.has(row.id as string)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => {
                  const rowId = row.id as string
                  setSelected(prev => {
                    const next = new Set(prev)
                    if (next.has(rowId)) next.delete(rowId)
                    else next.add(rowId)
                    return next
                  })
                }}
                className="h-4 w-4 cursor-pointer accent-amber-600"
              />
            ),
          },
          { key: 'id', header: 'ID', sortable: true },
          { key: 'qrCode', header: 'Código QR' },
          {
            key: 'status',
            header: 'Estado',
            render: row => <BarrelStatusBadge status={row.status as Barrel['status']} />,
          },
          { key: 'product', header: 'Producto', render: row => row.product ?? '—' },
          { key: 'capacity', header: 'Capacidad', render: row => `${row.capacity} L` },
          {
            key: 'updatedAt',
            header: 'Últ. movimiento',
            sortable: true,
            render: row => formatDate(row.updatedAt as string),
          },
        ]}
      />

      {/* Scan dialog */}
      <Dialog open={scanOpen} onOpenChange={open => { setScanOpen(open); setScanError(null); reset() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar / Escanear Barril</DialogTitle>
            <DialogDescription>
              Ingresa el código QR del barril. Si no existe, se creará automáticamente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onScan)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="qrCode">Código QR</Label>
              <Input
                id="qrCode"
                placeholder="BBC-001 o código grabado…"
                autoFocus
                {...register('qrCode', { required: 'El código es requerido' })}
              />
            </div>
            {scanError && <p className="text-xs text-red-500">{scanError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setScanOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={scanning}>
                {scanning ? 'Procesando…' : 'Registrar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
