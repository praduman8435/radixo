import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QR({ value, size = 220, className, label }: { value: string; size?: number; className?: string; label: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1F1A17', light: '#FFFFFF' } })
      .then(setSrc)
      .catch(() => setSrc(''))
  }, [value, size])
  return src ? <img src={src} width={size} height={size} alt={label} className={className} /> : <div style={{ width: size, height: size }} className={className} />
}
