'use client'

import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { api } from '@/lib/api'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatRelative, getLocalDateInputValue } from '@/lib/utils'
import type { Barrel, PaginatedResponse, Product, ProductionBatch } from '@/lib/types'

export default function LlenadoPage() {
  const qc = useQueryClient()

  const [productId, setProductId] = useState('')
  const [code, setCode] = useState('')
  const [fillDate, setFillDate] = useState(getLocalDateInputValue())
  const [selected, setSelected] = useState<Map<string, Barrel>>(new Map())
  const [scanValue, setScanValue] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const scanInputRef = useRef<HTMLInputElement>(null)

  const { data: products = [] } = useQuery({
    queryKey: ['productos', 'active'],
    queryFn: () => api.get<{ data: Product[] }>('/api/productos?isActive=true').then(r => r.data),
  })

  const { data: barrelPage, isLoading: barrelsLoading } = useQuery({
    queryKey: ['barriles', 'en-bodega', search],
    queryFn: () => {
      const params = new URLSearchParams({ status: 'EN_BODEGA', pageSize: '50' })
      if (search) params.set('search', search)
      return api.get<PaginatedResponse<Barrel>>(`/api/barriles?${params}`)
    },
  })

  const { data: misLotes } = useQuery({
    queryKey: ['lotes', 'mine'],
    queryFn: () => api.get<{ data: ProductionBatch[] }>('/api/lotes?mine=true').then(r => r.data),
  })

  // fillDate is a controlled `type="date"` input: clearing it natively yields ''. new
  // Date('').toISOString() throws (RangeError: Invalid time value), so require a
  // non-empty value before the lote — and the whole capture section below — is usable.
  const loteReady = productId !== '' && code.trim() !== '' && fillDate !== ''
  const selectedProduct = products.find(p => p.id === productId)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function addBarrel(barrel: Barrel) {
    if (selected.has(barrel.id)) {
      showToast(`${barrel.id} ya está en la lista`)
      return
    }
    setSelected(prev => new Map(prev).set(barrel.id, barrel))
  }

  function removeBarrel(id: string) {
    setSelected(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  async function onScanSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!scanValue.trim()) return
    setScanError(null)
    try {
      const res = await api.post<{ barrel: Barrel }>('/api/barriles/scan', { qrCode: scanValue.trim() })
      addBarrel(res.barrel)
      setScanValue('')
    } catch (err: unknown) {
      const e2 = err as { message?: string }
      setScanError(e2?.message ?? 'Error al escanear')
    } finally {
      scanInputRef.current?.focus()
    }
  }

  async function confirmLote() {
    if (!loteReady || selected.size === 0 || confirming) return
    setConfirming(true)
    try {
      const res = await api.post<{ data: ProductionBatch; warnings: string[] }>('/api/lotes', {
        productId,
        code,
        fillDate: new Date(fillDate).toISOString(),
        barrelIds: [...selected.keys()],
      })
      setSelected(new Map())
      qc.invalidateQueries({ queryKey: ['barriles', 'en-bodega'] })
      qc.invalidateQueries({ queryKey: ['lotes', 'mine'] })
      if (res.warnings.length > 0) {
        showToast(res.warnings[0] as string)
      } else {
        showToast(`Lote "${res.data.code}" confirmado — ${selected.size} barril(es)`)
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      showToast(e?.message ?? 'Error al confirmar el lote')
    } finally {
      setConfirming(false)
    }
  }

  const barrels = useMemo(() => barrelPage?.items ?? [], [barrelPage])

  return (
    <div className="space-y-5">
      {/* Formulario de lote */}
      <div className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-stone-800">1. Datos del lote</h2>
        <div>
          <Label>Producto</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {products.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProductId(p.id)}
                className={
                  productId === p.id
                    ? 'rounded-lg border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800'
                    : 'rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:border-stone-400'
                }
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="code">Código de lote</Label>
            <Input id="code" value={code} onChange={e => setCode(e.target.value)} placeholder="L-2026-001" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fillDate">Fecha de envasado</Label>
            <Input id="fillDate" type="date" value={fillDate} onChange={e => setFillDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Captura de barriles */}
      <div className={loteReady ? 'space-y-4' : 'space-y-4 opacity-40 pointer-events-none'}>
        <div className="rounded-xl border bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-stone-800">2. Escanear o seleccionar barriles</h2>
          <form onSubmit={onScanSubmit} className="flex gap-2 max-w-md">
            <Input
              ref={scanInputRef}
              autoFocus
              placeholder="Escanear código QR…"
              value={scanValue}
              onChange={e => setScanValue(e.target.value)}
            />
            <Button type="submit">Agregar</Button>
          </form>
          {scanError && <p className="text-xs text-red-500">{scanError}</p>}

          <Input
            placeholder="Buscar barril por ID…"
            className="max-w-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <DataTable<Barrel & Record<string, unknown>>
            loading={barrelsLoading}
            data={barrels as (Barrel & Record<string, unknown>)[]}
            emptyMessage="No hay barriles en bodega"
            onRowClick={row => addBarrel(row)}
            columns={[
              { key: 'id', header: 'ID' },
              {
                key: 'product',
                header: 'Producto actual',
                render: row => (row.product ? <Badge variant="destructive">{row.product}</Badge> : '—'),
              },
              { key: 'capacity', header: 'Capacidad', render: row => `${row.capacity} L` },
              {
                key: 'select',
                header: '',
                render: row => (selected.has(row.id) ? <CheckCircle2 className="h-4 w-4 text-amber-600" /> : null),
              },
            ]}
          />
        </div>

        {/* Lista acumulada */}
        {selected.size > 0 && (
          <div className="rounded-xl border bg-white p-5 space-y-2">
            <h2 className="text-sm font-semibold text-stone-800">
              3. Barriles del lote ({selected.size})
            </h2>
            {[...selected.values()].map(b => (
              <div key={b.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
                <div className="flex items-center gap-2">
                  {b.product && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  <span className="font-medium">{b.id}</span>
                  {b.product && <span className="text-stone-500">ya tenía: {b.product}</span>}
                </div>
                <button onClick={() => removeBarrel(b.id)} className="text-stone-400 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button onClick={confirmLote} disabled={confirming}>
                {confirming ? 'Confirmando…' : `Confirmar Lote (${selected.size})`}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Historial del día */}
      {misLotes && misLotes.length > 0 && (
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-stone-800">Mis lotes recientes</h2>
          <div className="space-y-2">
            {misLotes.map(lote => (
              <div key={lote.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
                <div>
                  <span className="font-medium">{lote.code}</span>
                  <span className="ml-2 text-stone-500">{lote.product?.name}</span>
                </div>
                <div className="flex items-center gap-3 text-stone-500">
                  <span>{lote.barrels?.length ?? 0} barril(es)</span>
                  <span>{formatRelative(lote.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
