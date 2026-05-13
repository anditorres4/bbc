'use client'

import { useQuery } from '@tanstack/react-query'
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { QrResponse } from '@/lib/types'

interface Props {
  barrelId: string
  productName?: string
  currentStatus?: string
}

export function QRDisplay({ barrelId, productName, currentStatus }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['barrel-qr', barrelId],
    queryFn: () => api.get<QrResponse>(`/api/barriles/${barrelId}/qr`),
  })

  function handleDownload() {
    if (!data) return
    const a = document.createElement('a')
    a.href = data.qrImage
    a.download = `${barrelId}.png`
    a.click()
  }

  function handlePrint() {
    if (!data) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Etiqueta ${barrelId}</title>
  <style>
    body { margin: 0; padding: 24px; text-align: center; font-family: monospace; background: #fff; }
    .print-content { display: inline-block; }
    img { width: 400px; height: 400px; display: block; }
    .barrel-id { font-size: 22px; font-weight: bold; margin-top: 12px; }
    .product-name { font-size: 14px; color: #555; margin-top: 4px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="print-content">
    <img src="${data.qrImage}" alt="${barrelId}" />
    <p class="barrel-id">${barrelId}</p>
    ${productName ? `<p class="product-name">${productName}</p>` : ''}
  </div>
</body>
</html>`)
    win.document.close()
    win.print()
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
        <Skeleton className="h-40 w-40 rounded-lg" />
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <img src={data.qrImage} alt={`QR ${barrelId}`} className="h-40 w-40 rounded-lg" />
      <div className="text-center">
        <p className="font-semibold text-stone-900">{barrelId}</p>
        {currentStatus && (
          <p className="text-xs text-stone-400">{currentStatus}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4" />
          Descargar PNG
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
          Imprimir Etiqueta
        </Button>
      </div>
    </div>
  )
}
