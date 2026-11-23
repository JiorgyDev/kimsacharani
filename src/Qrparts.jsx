import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Html5Qrcode } from 'html5-qrcode'

export function QrImg({ text, dead }) {
 const [u, setU] = useState('')

 useEffect(() => {
  QRCode.toDataURL(text, { margin: 1, width: 240 }).then(setU)
 }, [text])

 return (
  <div style={{ position: 'relative', width: 190, margin: '1rem auto' }}>
   {u && (
    <img
     src={u}
     alt="Código QR"
     style={{ width: '100%', borderRadius: 8, background: '#fff' }}
    />
   )}
   {dead && (
    <div
     style={{
      position: 'absolute',
      inset: 0,
      background: '#fffe',
      display: 'grid',
      placeItems: 'center',
      fontWeight: 700,
      color: '#9b2335',
      borderRadius: 8,
     }}
    >
     Expirado
    </div>
   )}
  </div>
 )
}

export function Scanner({ onCode }) {
 const [err, setErr] = useState('')

 useEffect(() => {
  const s = new Html5Qrcode('qr-reader')
  let on = true
  s.start(
   { facingMode: 'environment' },
   { fps: 10, qrbox: 200 },
   t => {
    if (on) {
     on = false
     onCode(t)
     s.stop().catch(() => {})
    }
   }
  ).catch(() => setErr('No se pudo abrir la cámara. Usa el código escrito.'))

  return () => {
   on = false
   try {
    s.isScanning && s.stop().catch(() => {})
   } catch (e) {}
  }
 }, [])

 return (
  <div>
   <div id="qr-reader" style={{ width: '100%', maxWidth: 280 }} />
   {err && <p className="note">{err}</p>}
  </div>
 )
}