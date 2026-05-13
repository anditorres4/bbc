import QRCode from 'qrcode'

export async function generateQRBase64(barrelId: string): Promise<string> {
  const buf = await QRCode.toBuffer(barrelId, {
    type: 'png',
    width: 300,
    margin: 2,
    color: { dark: '#1A1612', light: '#FAFAF8' },
  })
  return buf.toString('base64')
}
