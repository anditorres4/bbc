'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Beer, LayoutDashboard, Package, Truck, Bell, Users, LogOut, BarChart2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { clearAccessToken } from '@/lib/auth'
import { useRouter } from 'next/navigation'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/barriles', label: 'Barriles', icon: Package },
  { href: '/rutas', label: 'Rutas', icon: Truck },
  { href: '/alertas', label: 'Alertas', icon: Bell },
  { href: '/usuarios', label: 'Usuarios', icon: Users },
  { href: '/reportes', label: 'Reportes', icon: BarChart2 },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  function handleLogout() {
    clearAccessToken()
    router.push('/login')
  }

  return (
    <aside className="flex h-screen w-56 flex-shrink-0 flex-col border-r bg-white">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600">
          <Beer className="h-5 w-5 text-white" />
        </div>
        <span className="font-bold text-amber-600">BBC Barrel</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
              )}
            >
              <Icon className={cn('h-4 w-4', active ? 'text-amber-600' : 'text-stone-400')} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="border-t p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4 text-stone-400" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
