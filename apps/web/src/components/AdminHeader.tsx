'use client'

import { AlertBell } from './AlertBell'

interface Props {
  title: string
  user?: { name: string; role: string }
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  OPERARIO_BODEGA: 'Operario',
  TRANSPORTISTA: 'Transportista',
}

export function AdminHeader({ title, user }: Props) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-6">
      <h1 className="text-base font-semibold text-stone-900">{title}</h1>
      <div className="flex items-center gap-3">
        <AlertBell />
        {user && (
          <div className="text-right">
            <p className="text-sm font-medium text-stone-900 leading-none">{user.name}</p>
            <p className="text-xs text-stone-400 mt-0.5">{ROLE_LABEL[user.role] ?? user.role}</p>
          </div>
        )}
      </div>
    </header>
  )
}
