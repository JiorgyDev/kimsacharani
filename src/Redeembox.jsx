import { useState } from 'react'
import { redeem } from './Stamps'
import { Scanner } from './Qrparts'

export default function RedeemBox({ say }) {
 const [code, setCode] = useState(''),
  [cam, setCam] = useState(false),
  [busy, setBusy] = useState(false)

 const go = async c => {
  setBusy(true)
  try {
   await redeem(c)
   say('¡Sello acreditado!')
   setCode('')
   setCam(false)
  } catch (e) {
   say(
    e.code === 'permission-denied'
     ? 'No se pudo validar: el código ya fue usado o expiró.'
     : e.message
   )
  }
  setBusy(false)
 }

 return (
  <div
   style={{
    display: 'flex',
    flexDirection: 'column',
    gap: '.8rem',
    alignItems: 'flex-start',
    width: '100%',
   }}
  >
   <div
    style={{
     display: 'flex',
     gap: '.6rem',
     flexWrap: 'wrap',
     width: '100%',
    }}
   >
    <input
     style={{ flex: '1 1 180px', maxWidth: 260, textTransform: 'uppercase' }}
     placeholder="Código de 6 caracteres"
     aria-label="Código de sello"
     maxLength={8}
     value={code}
     onChange={e => setCode(e.target.value)}
     onKeyDown={e => e.key === 'Enter' && go(code)}
    />
    <button className="btn" disabled={busy || !code} onClick={() => go(code)}>
     Validar código
    </button>
    <button className="btn alt" onClick={() => setCam(!cam)}>
     {cam ? 'Cerrar cámara' : 'Escanear QR'}
    </button>
   </div>
   {cam && (
    <div style={{ width: '100%' }}>
     <Scanner onCode={go} />
    </div>
   )}
  </div>
 )
}