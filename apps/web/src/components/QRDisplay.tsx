'use client'

import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { QrResponse } from '@/lib/types'

interface Props {
  data: QrResponse
}

export function QRDisplay({ data }: Props) {
  function handleDownload() {
    const a = document.createElement('a')
    a.href = data.qrImage
    a.download = `qr-${data.id}.png`
    a.click()
  }

  function handlePrint() {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Etiqueta ${data.id}</title></head>
      <body style="text-align:center;font-family:monospace;padding:20px">
        <img src="${data.qrImage}" width="200" />
        <p style="font-size:18px;font-weight:bold;margin-top:12px">${data.id}</p>
        <p style="font-size:13px;color:#666">${data.qrCode}</p>
      </body></html>
    `)
    win.document.close()
    win.print()
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6">
      <img src={data.qrImage} alt={`QR ${data.id}`} className="h-40 w-40 rounded-lg" />
      <div className="text-center">
        <p className="font-semibold text-stone-900">{data.id}</p>
        <p className="text-xs text-stone-400">{data.qrCode}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4" />
          Descargar PNG
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
          Imprimir
        </Button>
      </div>
    </div>
  )
}
