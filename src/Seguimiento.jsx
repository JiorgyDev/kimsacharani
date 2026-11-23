import { useState, useEffect } from 'react'
import {
 doc,
 updateDoc,
 serverTimestamp,
 collection,
 query,
 where,
 limit,
 onSnapshot,
} from 'firebase/firestore'
import { db } from './fb'
import { QrImg } from './Qrparts'
import './Seguimiento.css'

// Flujo: tomado → preparando → servido → (cobro: completo, partes iguales o por consumo) → pagado
const PASOS = [
 ['tomado', 'Tomado'],
 ['preparando', 'En preparación'],
 ['servido', 'Servido'],
 ['pagado', 'Pagado'],
]
const SIG = {
 tomado: ['preparando', 'Pasar a preparación'],
 preparando: ['servido', 'Marcar servido'],
}
const PAGOS = [
 ['QR', '📱'],
 ['Efectivo', '💵'],
 ['Otro', '🧾'],
]
const MODOS = [
 ['completa', 'Cuenta completa'],
 ['iguales', '➗ Iguales'],
 ['consumo', '🍽 Por consumo'],
]
const MAXP = 10 // máximo de personas en partes iguales (debe coincidir con firestore.rules)
const bs = n => 'Bs ' + (Number(n) || 0).toFixed(2)
const r2 = n => Math.round(n * 100) / 100
const fechaTs = c => (c.ts?.toDate ? c.ts.toDate() : new Date())
const hora = c =>
 fechaTs(c).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
// Precio de una unidad de la línea (usa pu; si no existe, importe/cant)
const puDe = i =>
 Number(i.pu) || (Number(i.importe) || 0) / Math.max(1, Number(i.cant) || 1)
// Código aleatorio de demostración. Luego se reemplaza por el QR real de pago.
const rnd = () => {
 const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  r = crypto.getRandomValues(new Uint8Array(10))
 return 'KC-' + [...r].map(x => A[x % A.length]).join('')
}

// ---------------------------------------------------------------------------------------------
// Resumen de lo ya cobrado en una cuenta dividida (se usa en comandas y en pedidos web)
// c = {total, items:[{cant,desc,pu}], pagos, cobrado, modo, partes}
export function ResumenCobro({ c }) {
 const pagos = c.pagos || [],
  k = pagos.length,
  items = c.items || []
 if (!k) return null
 const modo = c.modo || (c.partes ? 'iguales' : ''),
  np = Number(c.partes) || 0
 const totalC = Math.round((Number(c.total) || 0) * 100),
  cobC = Math.round((Number(c.cobrado) || 0) * 100)
 const det2 = p =>
  (p.det || []).map(d => `${d.c}× ${items[d.n]?.desc || ''}`).join(', ')

 return (
  <div className="seg-partes">
   <b>
    Cuenta dividida · {k}{' '}
    {modo === 'iguales'
     ? `de ${np} partes cobradas`
     : k === 1
     ? 'persona pagó'
     : 'personas pagaron'}
   </b>
   <ul>
    {pagos.map((p, m) => (
     <li key={m}>
      ✓ {modo === 'iguales' ? `Parte ${m + 1}` : `Persona ${m + 1}`}: {p.metodo}{' '}
      · {bs(p.monto)}
      {p.det?.length > 0 && <small> — {det2(p)}</small>}
     </li>
    ))}
   </ul>
   <small>Falta cobrar {bs((totalC - cobC) / 100)}</small>
  </div>
 )
}

// ---------------------------------------------------------------------------------------------
// Panel de cobro (cuenta completa, partes iguales o por consumo). Lo usan "Pedidos en curso" y los pedidos web.
// onSave(data,final): guarda los datos de pago; el que llama agrega lo propio (estado/pagadoAt, o st del pedido web).
//   final=false → se cobró una parte y todavía falta · final=true → con esto la cuenta queda pagada.
//   Si falla debe lanzar el error (este panel lo muestra).
export function Cobro({ c, onSave, onClose }) {
 const pagos = c.pagos || [],
  k = pagos.length,
  items = c.items || []
 const bloq = c.modo || (c.partes ? 'iguales' : '') // una vez cobrada la primera parte, el modo ya no cambia
 const [modoSel, setModoSel] = useState('completa'),
  [n, setN] = useState(2),
  [sel, setSel] = useState({}),
  [pago, setPago] = useState('Efectivo'),
  [otro, setOtro] = useState(''),
  [qr, setQr] = useState(''),
  [busy, setBusy] = useState(false),
  [err, setErr] = useState('')
 const modo = bloq || modoSel
 const choose = p => {
  setPago(p)
  if (p === 'QR' && !qr) setQr(rnd())
 }
 const pagoTxt = pago === 'Otro' && otro.trim() ? `Otro: ${otro.trim()}` : pago

 // ---- Todo en centavos para que nunca sobren ni falten centavos ----
 const totalC = Math.round((Number(c.total) || 0) * 100),
  cobC = Math.round((Number(c.cobrado) || 0) * 100)
 const np = modo === 'iguales' ? Number(c.partes) || n : 0
 const baseC = np ? Math.floor(totalC / np) : 0,
  sobra = np ? totalC - baseC * np : 0
 const maxN = Math.max(2, Math.min(MAXP, totalC))

 // Por consumo: unidades que todavía nadie pagó
 const usado = items.map(() => 0)
 pagos.forEach(p =>
  (p.det || []).forEach(d => {
   if (usado[d.n] !== undefined) usado[d.n] += Number(d.c) || 0
  })
 )
 const quedan = items.map((i, x) =>
  Math.max(0, (Number(i.cant) || 0) - usado[x])
 )
 const remU = quedan.reduce((s, q) => s + q, 0)
 const selU = quedan.reduce((s, q, x) => s + Math.min(q, sel[x] || 0), 0)
 const selC = items.reduce(
  (s, i, x) => s + Math.round(puDe(i) * 100) * Math.min(quedan[x], sel[x] || 0),
  0
 )
 const todo = modo === 'consumo' && selU > 0 && selU === remU
 const setQ = (x, d) =>
  setSel(s => ({ ...s, [x]: Math.max(0, Math.min(quedan[x], (s[x] || 0) + d)) }))
 const todoQueda = () => setSel(Object.fromEntries(quedan.map((q, x) => [x, q])))
 const det = Object.entries(sel)
  .map(([x, q]) => ({ n: Number(x), c: Math.min(quedan[Number(x)] || 0, q) }))
  .filter(d => d.c > 0)

 const ultima = modo === 'iguales' ? k >= np - 1 : todo
 const montoC =
  modo === 'iguales'
   ? ultima
    ? totalC - cobC
    : baseC
   : modo === 'consumo'
   ? todo
    ? totalC - cobC
    : selC
   : totalC
 const monto = montoC / 100
 const puedo =
  modo !== 'consumo' || (selU > 0 && (todo ? k > 0 : cobC + montoC < totalC))
 const dividida = modo !== 'completa'

 const cobrar = async () => {
  setBusy(true)
  setErr('')
  try {
   if (!dividida) {
    await onSave({ pago: pagoTxt }, true)
    return
   }
   const parte = { metodo: pagoTxt, monto }
   if (modo === 'consumo') parte.det = det
   const nuevo = [...pagos, parte],
    cobrado = r2((cobC + montoC) / 100)
   const extra = modo === 'iguales' ? { modo, partes: np } : { modo }
   if (ultima) await onSave({ pago: 'Dividido', pagos: nuevo, cobrado, ...extra }, true)
   else {
    await onSave({ pagos: nuevo, cobrado, ...extra }, false)
    setQr(pago === 'QR' ? rnd() : '')
    setOtro('')
    setSel({})
   }
  } catch (e) {
   setErr('No se pudo actualizar: ' + (e.code || e.message))
  } finally {
   setBusy(false)
  }
 }

 const lblBtn = !dividida
  ? `Confirmar pago ${bs(c.total)}`
  : modo === 'iguales'
  ? ultima
   ? `Cobrar última parte ${bs(monto)} y cerrar`
   : `Cobrar parte ${k + 1} de ${np} · ${bs(monto)}`
  : todo
  ? `Cobrar lo que falta ${bs(monto)} y cerrar`
  : `Cobrar a persona ${k + 1} · ${bs(monto)}`

 return (
  <div className="seg-cobro">
   {err && (
    <p className="cmd-msg err" role="status">
     {err}
    </p>
   )}
   {!bloq && (
    <div className="seg-mode" role="group" aria-label="Forma de cobro">
     {MODOS.map(([m, l]) => (
      <button
       type="button"
       key={m}
       className={modo === m ? 'on' : ''}
       onClick={() => setModoSel(m)}
      >
       {l}
      </button>
     ))}
    </div>
   )}

   {modo === 'iguales' && !bloq && (
    <div className="seg-div">
     <small>¿Entre cuántas personas?</small>
     <div className="seg-nums">
      {Array.from({ length: maxN - 1 }, (_, i) => i + 2).map(x => (
       <button
        type="button"
        key={x}
        className={x === n ? 'on' : ''}
        onClick={() => setN(x)}
       >
        {x}
       </button>
      ))}
     </div>
     <p>
      <b>{bs(baseC / 100)}</b> por persona
      {sobra > 0 && (
       <small> · la última paga {bs((baseC + sobra) / 100)} por los centavos</small>
      )}
     </p>
    </div>
   )}
   {modo === 'iguales' && (
    <p className="seg-parte-now">
     Parte {k + 1} de {np}: <b>{bs(monto)}</b>
    </p>
   )}

   {modo === 'consumo' && (
    <div className="seg-sel">
     <small>Marca lo que consumió la persona {k + 1}</small>
     {items.map(
      (i, x) =>
       quedan[x] > 0 && (
        <div key={x} className="seg-sel-row">
         <span>
          {i.desc}
          <small>
           {' '}
           · {bs(puDe(i))} c/u · quedan {quedan[x]}
          </small>
         </span>
         <span className="seg-qty">
          <button
           type="button"
           aria-label={'Quitar ' + i.desc}
           disabled={!(sel[x] > 0)}
           onClick={() => setQ(x, -1)}
          >
           −
          </button>
          <b>{Math.min(quedan[x], sel[x] || 0)}</b>
          <button
           type="button"
           aria-label={'Agregar ' + i.desc}
           disabled={(sel[x] || 0) >= quedan[x]}
           onClick={() => setQ(x, 1)}
          >
           +
          </button>
         </span>
        </div>
       )
     )}
     <button type="button" className="btn alt" onClick={todoQueda}>
      Todo lo que falta
     </button>
     <p className="seg-parte-now">
      Le toca pagar: <b>{bs(selU ? monto : 0)}</b>
     </p>
     {todo && k === 0 && (
      <small>Si una sola persona paga todo, usa «Cuenta completa».</small>
     )}
    </div>
   )}

   <fieldset className="cmd-pay">
    <legend>Tipo de pago{dividida ? ' de esta parte' : ''}</legend>
    <div className="seg">
     {PAGOS.map(([p, i]) => (
      <label key={p} className={pago === p ? 'on' : ''}>
       <input
        type="radio"
        name={'pago-' + c.id}
        checked={pago === p}
        onChange={() => choose(p)}
       />
       <span aria-hidden="true">{i}</span> {p}
      </label>
     ))}
    </div>
    {pago === 'Otro' && (
     <input
      className="cmd-otro"
      value={otro}
      maxLength={40}
      onChange={e => setOtro(e.target.value)}
      placeholder="¿Cuál? Ej. tarjeta, transferencia"
     />
    )}
   </fieldset>
   {pago === 'QR' && qr && puedo && (
    <div className="cmd-qr">
     <div className="box">
      <QrImg text={qr} />
     </div>
     <b>{bs(dividida ? monto : c.total)}</b>
     <code>{qr}</code>
     <small>QR de demostración. Luego se conecta el QR real de pago.</small>
     <button type="button" className="btn alt" onClick={() => setQr(rnd())}>
      Generar otro QR
     </button>
    </div>
   )}
   <div className="seg-acts">
    <button className="btn red" disabled={busy || !puedo} onClick={cobrar}>
     {busy ? 'Guardando…' : lblBtn}
    </button>
    <button className="btn alt" disabled={busy} onClick={onClose}>
     Volver
    </button>
   </div>
  </div>
 )
}

// ---------------------------------------------------------------------------------------------
function Pedido({ c, now, onPaid }) {
 const [cobrando, setCobrando] = useState(false),
  [busy, setBusy] = useState(false),
  [err, setErr] = useState('')
 const ref = doc(db, 'comandas', c.id),
  idx = PASOS.findIndex(p => p[0] === c.estado)
 const mins = Math.max(0, Math.floor((now - fechaTs(c)) / 60000))

 const run = async data => {
  setBusy(true)
  setErr('')
  try {
   await updateDoc(ref, data)
  } catch (e) {
   setErr('No se pudo actualizar: ' + (e.code || e.message))
  } finally {
   setBusy(false)
  }
 }

 const k = (c.pagos || []).length
 // Guarda un pago de la comanda; si es el último, la pasa a "pagado" y avisa para generar el QR del club
 const onSave = async (data, final) => {
  await updateDoc(
   ref,
   final ? { estado: 'pagado', pagadoAt: serverTimestamp(), ...data } : data
  )
  if (final && onPaid) onPaid(c.total)
 }

 return (
  <div className={'seg-pedido ' + c.estado}>
   <div className="seg-top">
    <div>
     <b className="seg-mesa">Mesa {c.mesa}</b>
     <small>
      {' '}
      · {hora(c)} · hace {mins} min
     </small>
    </div>
    <b>{bs(c.total)}</b>
   </div>
   <ol className="seg-steps" aria-label="Progreso del pedido">
    {PASOS.map(([kk, l], i) => (
     <li key={kk} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
      {l}
     </li>
    ))}
   </ol>
   <ul className="seg-items">
    {(c.items || []).map((i, m) => (
     <li key={m}>
      <b>{i.cant}×</b> {i.desc}
     </li>
    ))}
   </ul>
   {c.estado === 'servido' && <ResumenCobro c={c} />}
   {err && (
    <p className="cmd-msg err" role="status">
     {err}
    </p>
   )}

   {!cobrando && SIG[c.estado] && (
    <button
     className="btn red seg-go"
     disabled={busy}
     onClick={() => run({ estado: SIG[c.estado][0] })}
    >
     {SIG[c.estado][1]}
    </button>
   )}
   {!cobrando && c.estado === 'servido' && (
    <button className="btn red seg-go" onClick={() => setCobrando(true)}>
     {k > 0 ? 'Seguir cobrando' : 'Cobrar'}
    </button>
   )}
   {cobrando && (
    <Cobro c={c} onSave={onSave} onClose={() => setCobrando(false)} />
   )}
  </div>
 )
}

// Pedidos del empleado que todavía no se pagaron (solo se leen los pendientes, no toda la historia).
// Al pagarse pasan solos al historial.
export default function EnCurso({ email, onPaid }) {
 const [list, setList] = useState([]),
  [err, setErr] = useState(''),
  [now, setNow] = useState(Date.now())

 useEffect(() => {
  if (!email) return
  return onSnapshot(
   query(
    collection(db, 'comandas'),
    where('by', '==', email),
    where('estado', 'in', ['tomado', 'preparando', 'servido']),
    limit(100)
   ),
   s => {
    setList(
     s.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.estado && c.estado !== 'pagado')
      .sort((a, b) => fechaTs(a) - fechaTs(b))
    )
    setErr('')
   },
   e => setErr(e.code || e.message)
  )
 }, [email])

 useEffect(() => {
  const i = setInterval(() => setNow(Date.now()), 30000)
  return () => clearInterval(i)
 }, [])

 return (
  <div className="p-card" style={{ marginTop: '1.25rem' }}>
   <div className="seg-head">
    <h3>Pedidos en curso</h3>
    <span className="p-badge">{list.length}</span>
   </div>
   {err && <p className="p-note">No se pudieron leer los pedidos ({err}).</p>}
   {list.length ? (
    <div className="seg-list">
     {list.map(c => (
      <Pedido key={c.id} c={c} now={now} onPaid={onPaid} />
     ))}
    </div>
   ) : (
    <p className="p-note">
     No hay pedidos en curso. Toma uno arriba y aparecerá aquí.
    </p>
   )}
  </div>
 )
}