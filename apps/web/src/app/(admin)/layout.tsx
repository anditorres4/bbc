'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { AdminSidebar } from '@/components/AdminSidebar'
import { AdminHeader } from '@/components/AdminHeader'
import { getAccessToken } from '@/lib/auth'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'

function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ data: User }>('/auth/me').then(r => r.data),
    retry: false,
  })
}

function useSseAlerts() {
  const qc = useQueryClient()
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return

    const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
    const es = new EventSource(
      `${BASE}/api/alertas/stream?token=${encodeURIComponent(token)}`,
      { withCredentials: true }
    )
    esRef.current = es

    es.addEventListener('alerta', () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
    })

    es.onerror = () => {
      es.close()
      esRef.current = null
    }

    return () => {
      es.close()
    }
  }, [qc])
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { data: user, isError, isPending } = useCurrentUser()
  useSseAlerts()

  useEffect(() => {
    if (isError) router.push('/login')
  }, [isError, router])

  const pageTitle = (() => {
    if (typeof window === 'undefined') return 'BBC Barrel Track'
    const path = window.location.pathname
    if (path.includes('/dashboard')) return 'Dashboard'
    if (path.includes('/barriles')) return 'Barriles'
    if (path.includes('/rutas')) return 'Rutas'
    if (path.includes('/alertas')) return 'Alertas'
    if (path.includes('/usuarios')) return 'Usuarios'
    if (path.includes('/reportes')) return 'Reportes'
    if (path.includes('/llenado')) return 'Llenado'
    if (path.includes('/productos')) return 'Productos'
    return 'BBC Barrel Track'
  })()

  const PRODUCCION_ALLOWED_PREFIXES = ['/llenado', '/barriles']
  useEffect(() => {
    if (!user || user.role !== 'PRODUCCION') return
    if (typeof window === 'undefined') return
    const path = window.location.pathname
    const allowed = PRODUCCION_ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix))
    if (!allowed) router.replace('/llenado')
  }, [user, router])

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FAFAF8]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar role={user?.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader title={pageTitle} user={user ?? undefined} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutInner>{children}</AdminLayoutInner>
}
