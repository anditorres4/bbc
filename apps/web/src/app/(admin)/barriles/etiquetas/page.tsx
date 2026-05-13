'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQueries } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { QrResponse } from '@/lib/types'

function EtiquetasContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ids = (searchParams.get('ids') ?? '').split(',').filter(id => id.trim())

  const queries = useQueries({
    queries: ids.map(id => ({
      queryKey: ['barrel-qr', id],
      queryFn: () => api.get<QrResponse>(`/api/barriles/${id}/qr`),
    })),
  })

  const allLoaded = queries.every(q => !q.isLoading)

  return (
    <div>
      <div className="mb-6 flex items-center gap-4 print:hidden">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="flex-1 text-xl font-semibold">
          Etiquetas ({ids.length} barril{ids.length !== 1 ? 'es' : ''})
        </h2>
        <Button onClick={() => window.print()} disabled={!allLoaded}>
          <Printer className="h-4 w-4" />
          Imprimir
        </Button>
      </div>

      <div className="grid gap-4 p-5" style={{ gridTemplateColumns: 'repeat(3, auto)' }}>
        {ids.map((id, i) => {
          const q = queries[i]
          return (
            <div
              key={id}
              className="flex flex-col items-center justify-center break-inside-avoid rounded-lg border p-4"
              style={{ width: '8cm', height: '8cm' }}
            >
              {q?.isLoading ? (
                <p className="text-sm text-stone-400">Cargando…</p>
              ) : !q?.data ? (
                <p className="text-sm text-red-500">Error: {id}</p>
              ) : (
                <>
                  <img
                    src={q.data.qrImage}
                    alt={id}
                    style={{ width: '6cm', height: '6cm' }}
                  />
                  <p className="mt-2 text-sm font-bold">{id}</p>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function EtiquetasPage() {
  return (
    <Suspense fallback={<div className="p-8 text-stone-400">Cargando etiquetas…</div>}>
      <EtiquetasContent />
    </Suspense>
  )
}
