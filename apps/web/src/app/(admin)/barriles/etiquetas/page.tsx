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

  function printLabels() {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Etiquetas BBC</title>
  <style>
    @page { margin: 1cm; }
    body { margin: 0; font-family: Arial, sans-serif; }
    .grid { display: grid; grid-template-columns: repeat(3, 8cm); gap: 0.4cm; }
    .label { width: 8cm; height: 8cm; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid #ccc; break-inside: avoid; }
    .label img { width: 6cm; height: 6cm; }
    .label p { margin: 6px 0 0; font-weight: bold; font-size: 13pt; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div class="grid">
    ${ids.map((id, i) => {
      const data = queries[i]?.data
      if (!data) return ''
      return `<div class="label"><img src="${data.qrImage}" alt="${id}"><p>${id}</p></div>`
    }).join('\n    ')}
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

    const win = window.open('', '_blank', 'width=960,height=720')
    win?.document.write(html)
    win?.document.close()
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="flex-1 text-xl font-semibold">
          Etiquetas ({ids.length} barril{ids.length !== 1 ? 'es' : ''})
        </h2>
        <Button onClick={printLabels} disabled={!allLoaded}>
          <Printer className="h-4 w-4" />
          Imprimir / Guardar PDF
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
