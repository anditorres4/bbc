'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, ArrowLeft, Loader2 } from 'lucide-react'
import { useForm, useFieldArray } from 'react-hook-form'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { User, DeliveryPoint, PaginatedResponse, Barrel } from '@/lib/types'

interface BarrelEntry { barrelId: string; product: string }
interface StopEntry { deliveryPointId: string; position: number; barrels: BarrelEntry[] }
interface FormData {
  name: string
  date: string
  transportistId: string
  vehiclePlate: string
  stops: StopEntry[]
}

export default function NuevaRutaPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const { data: transportistas } = useQuery({
    queryKey: ['users', 'transportistas'],
    queryFn: () => api.get<PaginatedResponse<User>>('/api/usuarios?role=TRANSPORTISTA&isActive=true&pageSize=50'),
  })

  const { data: puntos } = useQuery({
    queryKey: ['puntos'],
    queryFn: () => api.get<{ data: DeliveryPoint[] }>('/api/puntos'),
  })

  const { data: barriles } = useQuery({
    queryKey: ['barrels', 'bodega'],
    queryFn: () => api.get<PaginatedResponse<Barrel>>('/api/barriles?status=EN_BODEGA&pageSize=200'),
  })

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<FormData>({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      stops: [{ deliveryPointId: '', position: 1, barrels: [{ barrelId: '', product: '' }] }],
    },
  })

  const { fields: stops, append: addStop, remove: removeStop } = useFieldArray({
    control,
    name: 'stops',
  })

  async function onSubmit(data: FormData) {
    setServerError(null)
    try {
      const payload = {
        ...data,
        stops: data.stops.map((s, i) => ({
          ...s,
          position: i + 1,
          barrels: s.barrels.filter(b => b.barrelId && b.product),
        })),
      }
      const res = await api.post<{ data: { id: string } }>('/api/rutas', payload)
      router.push(`/rutas/${res.data.id}`)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setServerError(e?.message ?? 'Error al crear ruta')
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">Nueva Ruta</h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* General info */}
        <Card>
          <CardHeader><CardTitle>Información general</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Nombre de la ruta</Label>
              <Input {...register('name', { required: 'Requerido' })} placeholder="Ruta Norte - Lunes" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" {...register('date', { required: 'Requerido' })} />
            </div>
            <div className="space-y-1.5">
              <Label>Placa vehículo</Label>
              <Input {...register('vehiclePlate')} placeholder="ABC-123" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Transportista</Label>
              <Select onValueChange={v => setValue('transportistId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar transportista" />
                </SelectTrigger>
                <SelectContent>
                  {transportistas?.items?.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.transportistId && <p className="text-xs text-red-500">Selecciona un transportista</p>}
            </div>
          </CardContent>
        </Card>

        {/* Stops */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Paradas</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addStop({ deliveryPointId: '', position: stops.length + 1, barrels: [{ barrelId: '', product: '' }] })}
              >
                <Plus className="h-4 w-4" />
                Agregar parada
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {stops.map((stop, stopIdx) => (
              <div key={stop.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Parada {stopIdx + 1}</h4>
                  {stops.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeStop(stopIdx)}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Punto de entrega</Label>
                  <Select onValueChange={v => setValue(`stops.${stopIdx}.deliveryPointId`, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar punto" />
                    </SelectTrigger>
                    <SelectContent>
                      {puntos?.data?.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Barrels */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Barriles</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const current = watch(`stops.${stopIdx}.barrels`) ?? []
                        setValue(`stops.${stopIdx}.barrels`, [...current, { barrelId: '', product: '' }])
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      Agregar barril
                    </Button>
                  </div>
                  {(watch(`stops.${stopIdx}.barrels`) ?? []).map((_, barrelIdx) => (
                    <div key={barrelIdx} className="flex gap-2">
                      <Select onValueChange={v => setValue(`stops.${stopIdx}.barrels.${barrelIdx}.barrelId`, v)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Seleccionar barril" />
                        </SelectTrigger>
                        <SelectContent>
                          {barriles?.items?.map(b => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.id} {b.product ? `— ${b.product}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Producto"
                        className="w-36"
                        {...register(`stops.${stopIdx}.barrels.${barrelIdx}.product`)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const current = watch(`stops.${stopIdx}.barrels`)
                          setValue(`stops.${stopIdx}.barrels`, current.filter((_, j) => j !== barrelIdx))
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-stone-400" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {serverError && <p className="text-sm text-red-500">{serverError}</p>}

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando…</> : 'Crear ruta'}
          </Button>
        </div>
      </form>
    </div>
  )
}
