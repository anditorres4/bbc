'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { api } from '@/lib/api'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { Product } from '@/lib/types'

type FormValues = { name: string; defaultCapacity?: number }

export default function ProductosPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, reset } = useForm<FormValues>()

  const { data, isLoading } = useQuery({
    queryKey: ['productos', 'all'],
    queryFn: () => api.get<{ data: Product[] }>('/api/productos').then(r => r.data),
  })

  function openCreate() {
    setEditing(null)
    reset({ name: '', defaultCapacity: undefined })
    setDialogOpen(true)
  }

  function openEdit(product: Product) {
    setEditing(product)
    reset({ name: product.name, defaultCapacity: product.defaultCapacity ?? undefined })
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    setError(null)
    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/api/productos/${editing.id}`, values)
      } else {
        await api.post('/api/productos', values)
      }
      qc.invalidateQueries({ queryKey: ['productos'] })
      setDialogOpen(false)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message ?? 'Error al guardar el producto')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(product: Product) {
    await api.patch(`/api/productos/${product.id}`, { isActive: !product.isActive })
    qc.invalidateQueries({ queryKey: ['productos'] })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-800">Productos</h2>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo Producto
        </Button>
      </div>

      <DataTable<Product & Record<string, unknown>>
        loading={isLoading}
        data={(data ?? []) as (Product & Record<string, unknown>)[]}
        emptyMessage="No hay productos registrados"
        onRowClick={row => openEdit(row)}
        columns={[
          { key: 'name', header: 'Nombre', sortable: true },
          {
            key: 'defaultCapacity',
            header: 'Capacidad default',
            render: row => (row.defaultCapacity ? `${row.defaultCapacity} L` : '—'),
          },
          {
            key: 'isActive',
            header: 'Estado',
            render: row => (
              <Badge variant={row.isActive ? 'default' : 'secondary'}>
                {row.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: '',
            render: row => (
              <Button
                variant="outline"
                size="sm"
                onClick={e => { e.stopPropagation(); toggleActive(row) }}
              >
                {row.isActive ? 'Desactivar' : 'Activar'}
              </Button>
            ),
          },
        ]}
      />

      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); setError(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
            <DialogDescription>
              El nombre es el que verá el equipo de producción al armar un lote.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" autoFocus {...register('name', { required: 'El nombre es requerido' })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="defaultCapacity">Capacidad default (L)</Label>
              <Input
                id="defaultCapacity"
                type="number"
                {...register('defaultCapacity', { valueAsNumber: true })}
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
