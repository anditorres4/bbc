'use client'

import { Bell } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatRelative } from '@/lib/utils'
import type { Alert, PaginatedResponse } from '@/lib/types'
import { cn } from '@/lib/utils'

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-100 border-red-200',
  WARNING: 'bg-amber-50 border-amber-200',
  INFO: 'bg-stone-50 border-stone-200',
}

export function AlertBell() {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['alerts', 'unread'],
    queryFn: () => api.get<PaginatedResponse<Alert>>('/api/alertas?isRead=false&pageSize=5'),
    refetchInterval: 30_000,
  })

  const unread = data?.total ?? 0
  const recent = data?.items ?? []

  async function markRead(id: string) {
    await api.patch(`/api/alertas/${id}/leer`)
    qc.invalidateQueries({ queryKey: ['alerts'] })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Alertas</h4>
          {unread > 0 && <span className="text-xs text-stone-500">{unread} sin leer</span>}
        </div>
        {recent.length === 0 ? (
          <p className="p-4 text-center text-sm text-stone-400">Sin alertas pendientes</p>
        ) : (
          <ul className="max-h-80 overflow-auto divide-y">
            {recent.map(alert => (
              <li
                key={alert.id}
                className={cn('flex items-start gap-3 border-l-4 p-4 cursor-pointer hover:bg-stone-50', SEVERITY_COLOR[alert.severity])}
                onClick={() => markRead(alert.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-stone-900 line-clamp-2">{alert.message}</p>
                  <p className="mt-0.5 text-[10px] text-stone-400">{formatRelative(alert.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t p-2">
          <a href="/alertas" className="block text-center text-xs text-amber-600 hover:underline py-1">
            Ver todas las alertas
          </a>
        </div>
      </PopoverContent>
    </Popover>
  )
}
