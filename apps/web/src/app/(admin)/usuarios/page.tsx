'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, UserCheck, UserX } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { DataTable } from '@/components/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { User, PaginatedResponse, Role } from '@/lib/types'

const ROLES: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'OPERARIO_BODEGA', label: 'Operario Bodega' },
  { value: 'TRANSPORTISTA', label: 'Transportista' },
]

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  name: z.string().min(1, 'Requerido'),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'OPERARIO_BODEGA', 'TRANSPORTISTA']),
})

type FormData = z.infer<typeof schema>

export default function UsuariosPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [filterRole, setFilterRole] = useState<string>('all')
  const [filterActive, setFilterActive] = useState<string>('true')
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, filterRole, filterActive],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' })
      if (filterRole !== 'all') params.set('role', filterRole)
      if (filterActive !== 'all') params.set('isActive', filterActive)
      return api.get<PaginatedResponse<User>>(`/api/usuarios?${params}`)
    },
  })

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'OPERARIO_BODEGA' },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? api.patch(`/api/usuarios/${id}/activate`) : api.delete(`/api/usuarios/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  async function onCreateSubmit(data: FormData) {
    setCreateError(null)
    try {
      await api.post('/api/usuarios', data)
      qc.invalidateQueries({ queryKey: ['users'] })
      setCreateOpen(false)
      reset()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setCreateError(e?.message ?? 'Error al crear usuario')
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Select value={filterRole} onValueChange={v => { setFilterRole(v); setPage(1) }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos los roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterActive} onValueChange={v => { setFilterActive(v); setPage(1) }}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="true">Activos</SelectItem>
              <SelectItem value="false">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo Usuario
        </Button>
      </div>

      {/* Table */}
      <DataTable<User & Record<string, unknown>>
        loading={isLoading}
        data={(data?.items ?? []) as (User & Record<string, unknown>)[]}
        pagination={data ? { page, totalPages: data.totalPages, onPageChange: setPage } : undefined}
        columns={[
          { key: 'name', header: 'Nombre', sortable: true },
          { key: 'email', header: 'Email' },
          {
            key: 'role',
            header: 'Rol',
            render: row => {
              const r = ROLES.find(x => x.value === row.role)
              return <Badge variant="secondary">{r?.label ?? String(row.role)}</Badge>
            },
          },
          {
            key: 'isActive',
            header: 'Estado',
            render: row => (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.isActive ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                {row.isActive ? 'Activo' : 'Inactivo'}
              </span>
            ),
          },
          {
            key: 'createdAt',
            header: 'Registro',
            render: row => formatDate(row.createdAt as string),
          },
          {
            key: 'actions',
            header: '',
            render: row => (
              <Button
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation()
                  toggleActiveMutation.mutate({ id: row.id as string, active: !row.isActive })
                }}
              >
                {row.isActive
                  ? <><UserX className="h-4 w-4 text-red-400" /> Desactivar</>
                  : <><UserCheck className="h-4 w-4 text-green-500" /> Activar</>
                }
              </Button>
            ),
          },
        ]}
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); setCreateError(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Usuario</DialogTitle>
            <DialogDescription>Ingresa los datos del nuevo usuario.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Nombre completo</Label>
                <Input {...register('name')} placeholder="Juan Pérez" />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" {...register('email')} placeholder="juan@bbc.co" />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input {...register('phone')} placeholder="+57 300 000 0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Contraseña</Label>
                <Input type="password" {...register('password')} placeholder="Mínimo 8 caracteres" />
                {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select onValueChange={v => setValue('role', v as Role)} defaultValue="OPERARIO_BODEGA">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {createError && <p className="text-xs text-red-500">{createError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creando…' : 'Crear usuario'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
