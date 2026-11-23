import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, MotionConfig, animate } from 'framer-motion'
import { PRODUCTS, money } from './data'
import { signOut } from 'firebase/auth'
import {
 doc,
 updateDoc,
 increment,
 setDoc,
 getDoc,
 getDocs,
 runTransaction,
 Timestamp,
 serverTimestamp,
 collection,
 query,
 orderBy,
 limit,
 where,
 onSnapshot,
} from 'firebase/firestore'
import { QrImg } from './Qrparts'
import { auth, db } from './fb'
import { useSession, useOrders } from './useSession'
import LoginForm from './Login'
import Comanda from './Comanda'
import EnCurso, { Cobro, ResumenCobro } from './Seguimiento'
import Usuarios from './Usuarios'
import useMenu, { agotado } from './useMenu'
import './panels.css'

const FLOW = ['Pendiente', 'Aceptado', 'En preparación', 'Listo', 'Entregado']
const LOG = [
 ['10:42', 'Ana (empleada)', 'Generó QR de compra #4821'],
 ['10:31', 'Sistema', 'QR #4807 expiró sin usar'],
 ['10:12', 'Ana (empleada)', 'Validó canje de café gratis'],
 ['09:58', 'Sistema', 'Intento de reutilizar QR #4790 bloqueado'],
 ['09:40', 'Propietario', 'Cambió precio de Mocaccino'],
]
const PAGOS = ['QR', 'Efectivo', 'Otro', 'Web']
const ESTADO = {
 tomado: 'Tomado',
 preparando: 'En preparación',
 servido: 'Servido',
 pagado: 'Pagado',
}
const esPagada = c => !c.estado || c.estado === 'pagado'
const bs = n => 'Bs ' + (Number(n) || 0).toFixed(2)
const hoy = () => new Date().toLocaleDateString('sv-SE')
const fechaTs = c => (c.ts?.toDate ? c.ts.toDate() : new Date())
const hora = c =>
 fechaTs(c).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })

// ---- Pagos: una comanda puede tener un solo método (c.pago) o varios (c.pagos, cuenta dividida) ----
// Devuelve [[método, monto], ...]. Las comandas viejas siguen contando igual que antes.
const partesPago = c =>
 c.pagos?.length
  ? c.pagos.map(p => [p.metodo || '', Number(p.monto) || 0])
  : [[c.pago || '', Number(c.total) || 0]]

const sumaMetodo = (lista, p) =>
 lista.reduce(
  (s, c) =>
   s +
   partesPago(c)
    .filter(([m]) => m.startsWith(p))
    .reduce((a, [, v]) => a + v, 0),
  0
 )

const etiqueta = c =>
 c.pagos?.length
  ? [...new Set(c.pagos.map(p => (p.metodo || '').split(':')[0]))].join(' + ')
  : c.pago || 'Pagado'

const lineasPedido = o => (o.items || []).map(i => `${i.q}× ${i.n}`).join(', ')
const falta = c => Math.max(0, (Number(c.total) || 0) - (Number(c.cobrado) || 0))

// Lee en tiempo real solo las comandas del día elegido (solo personal, según las reglas de Firestore)
function useComandas(f) {
 const [st, setSt] = useState({ list: [], err: '' })

 useEffect(
  () =>
   onSnapshot(
    query(collection(db, 'comandas'), where('fecha', '==', f), limit(500)),
    s =>
     setSt({
      list: s.docs
       .map(d => ({ id: d.id, ...d.data() }))
       .sort((a, b) => fechaTs(b) - fechaTs(a)),
      err: '',
     }),
    e => setSt({ list: [], err: e.code || e.message })
   ),
  [f]
 )

 return st
}

function Num({ to, fmt = v => Math.round(v) }) {
 const [v, setV] = useState(0)

 useEffect(() => {
  const c = animate(0, to, { duration: 1.2, onUpdate: setV })
  return () => c.stop()
 }, [to])

 return <>{fmt(v)}</>
}

const Stat = ({ l, to, fmt }) => (
 <div className="p-card p-stat">
  <small>{l}</small>
  <b>
   <Num to={to} fmt={fmt} />
  </b>
 </div>
)

const Tabs = ({ list, t, set }) => (
 <div className="p-tabs">
  {list.map(x => (
   <button key={x} className={x === t ? 'on' : ''} onClick={() => set(x)}>
    {x === t && <motion.span layoutId="ptab" className="pill" />}
    {x}
   </button>
  ))}
 </div>
)

// AnimatePresence necesita la key en el hijo directo (<View key={t}>) para animar la salida
const View = ({ children }) => (
 <motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0 }}
 >
  {children}
 </motion.div>
)

function DayPicker({ f, set }) {
 return (
  <label
   className="p-note"
   style={{
    display: 'inline-flex',
    gap: '.6rem',
    alignItems: 'center',
    marginBottom: '1rem',
   }}
  >
   Día
   <input
    type="date"
    value={f}
    onChange={e => e.target.value && set(e.target.value)}
   />
  </label>
 )
}

function Resumen({ day, pend }) {
 const tot = day.reduce((s, c) => s + c.total, 0)
 const pay = PAGOS.map(p => [p, sumaMetodo(day, p)])
 const H = Array.from({ length: 13 }, (_, i) => i + 8)
 const byH = H.map(h =>
  day.filter(c => fechaTs(c).getHours() === h).reduce((s, c) => s + c.total, 0)
 )
 const maxH = Math.max(...byH, 1)
 const prod = {}
 day.forEach(c =>
  (c.items || []).forEach(i => {
   prod[i.desc] = (prod[i.desc] || 0) + i.cant
  })
 )
 const top = Object.entries(prod)
   .sort((a, b) => b[1] - a[1])
   .slice(0, 5),
  maxP = top[0]?.[1] || 1

 return (
  <>
   <div className="p-grid">
    <Stat l="Ventas del día" to={tot} fmt={bs} />
    <Stat l="Comandas" to={day.length} />
    <Stat l="Ticket promedio" to={day.length ? tot / day.length : 0} fmt={bs} />
    <Stat l="Por cobrar" to={pend} fmt={bs} />
   </div>
   <div className="p-two" style={{ marginTop: '1rem' }}>
    <div className="p-card">
     <h3>Ventas por hora</h3>
     <div className="p-bars">
      {H.map((h, i) => (
       <div key={h} title={bs(byH[i])}>
        <motion.i
         initial={{ height: 0 }}
         animate={{ height: `${(byH[i] / maxH) * 85}%` }}
         transition={{ delay: i * .05, duration: .6 }}
        />
        {h}h
       </div>
      ))}
     </div>
    </div>
    <div className="p-card">
     <h3>Por tipo de pago</h3>
     {pay.map(([p, v]) => (
      <div key={p} style={{ marginBottom: '.5rem' }}>
       <div className="p-row" style={{ border: 0, padding: 0 }}>
        <span>{p}</span>
        <b>{bs(v)}</b>
       </div>
       <motion.div
        className="p-meter"
        initial={{ width: 0 }}
        animate={{ width: `${tot ? (v / tot) * 100 : 0}%` }}
        transition={{ duration: .7 }}
       />
      </div>
     ))}
     <h3 style={{ marginTop: '1rem' }}>Más vendidos</h3>
     {top.length ? (
      top.map(([n, v], i) => (
       <div key={n} style={{ marginBottom: '.5rem' }}>
        <div className="p-row" style={{ border: 0, padding: 0 }}>
         <span>{n}</span>
         <b>{v}</b>
        </div>
        <motion.div
         className="p-meter"
         initial={{ width: 0 }}
         animate={{ width: `${(v / maxP) * 100}%` }}
         transition={{ delay: .2 + i * .1, duration: .7 }}
        />
       </div>
      ))
     ) : (
      <p className="p-note">Sin ventas este día.</p>
     )}
    </div>
   </div>
  </>
 )
}

// ---- Menú y stock (propietario): cada cambio se guarda en Firestore y se ve en toda la página ----
function FilaProducto({ p }) {
 const [precio, setPrecio] = useState(String(p.price)),
  [stock, setStock] = useState(
   typeof p.stock === 'number' ? String(p.stock) : ''
  ),
  [err, setErr] = useState('')

 useEffect(() => setPrecio(String(p.price)), [p.price])
 useEffect(
  () => setStock(typeof p.stock === 'number' ? String(p.stock) : ''),
  [p.stock]
 )

 const ref = doc(db, 'menu', String(p.id))

 const save = async data => {
  setErr('')
  try {
   await updateDoc(ref, data)
  } catch (e) {
   setErr(e.code || e.message)
  }
 }

 const savePrecio = () => {
  const v = parseFloat(precio.replace(',', '.'))
  if (!(v >= 0) || v > 10000 || v === p.price) {
   setPrecio(String(p.price))
   return
  }
  save({ price: v })
 }

 const saveStock = () => {
  const t = stock.trim()
  if (t === '') {
   if (typeof p.stock === 'number') save({ stock: null })
   return
  }
  const v = Math.floor(Number(t))
  if (!(v >= 0) || v > 9999) {
   setStock(typeof p.stock === 'number' ? String(p.stock) : '')
   return
  }
  if (v === p.stock) return
  save(
   v === 0
    ? { stock: 0, out: true }
    : p.out
    ? { stock: v, out: false }
    : { stock: v }
  )
 }

 const toggle = () => {
  if (p.stock === 0) {
   setErr('Sin stock: agrega unidades para habilitarlo.')
   return
  }
  save({ out: !p.out })
 }

 const enter = e => {
  if (e.key === 'Enter') e.currentTarget.blur()
 }

 const ag = agotado(p)

 return (
  <div className="p-row">
   <span>
    {p.emoji} {p.name} <small>({p.cat})</small>
    {err && (
     <>
      <br />
      <small>Error: {err}</small>
     </>
    )}
   </span>
   <span style={{ display: 'flex', gap: '.8rem', alignItems: 'center' }}>
    <input
     type="number"
     step=".5"
     min="0"
     value={precio}
     aria-label={'Precio de ' + p.name}
     onChange={e => setPrecio(e.target.value)}
     onBlur={savePrecio}
     onKeyDown={enter}
    />
    <input
     type="number"
     min="0"
     step="1"
     style={{ width: '5rem' }}
     placeholder="∞"
     value={stock}
     aria-label={'Stock de ' + p.name}
     title="Vacío = sin control de cantidad"
     onChange={e => setStock(e.target.value)}
     onBlur={saveStock}
     onKeyDown={enter}
    />
    <button
     className={'p-sw' + (ag ? '' : ' on')}
     aria-label="Disponibilidad"
     onClick={toggle}
    >
     <motion.i layout />
    </button>
    <small>{ag ? 'Agotado' : 'Disponible'}</small>
   </span>
  </div>
 )
}

function Productos() {
 const { list, live, err } = useMenu(),
  [busy, setBusy] = useState(false),
  [msg, setMsg] = useState('')

 // Carga el menú de data.js en Firestore (solo se hace una vez)
 const seed = async () => {
  setBusy(true)
  setMsg('')
  try {
   await Promise.all(
    PRODUCTS.map(x =>
     setDoc(doc(db, 'menu', String(x.id)), {
      id: x.id,
      cat: x.cat,
      name: x.name,
      desc: x.desc,
      price: x.price,
      emoji: x.emoji,
      out: false,
      stock: null,
     })
    )
   )
   setMsg('Menú cargado ✓')
  } catch (e) {
   setMsg('No se pudo cargar: ' + (e.code || e.message))
  }
  setBusy(false)
 }

 return (
  <div className="p-card">
   <h3>Menú y stock</h3>
   {err && <p className="p-note">No se pudo leer el menú ({err}).</p>}
   {!live ? (
    <>
     <p>
      El menú todavía no está guardado en Firestore: el sitio usa los datos de
      data.js. Cárgalo una vez para poder editar precios y stock desde aquí.
     </p>
     <button className="btn red" onClick={seed} disabled={busy}>
      {busy ? 'Cargando…' : 'Cargar menú inicial'}
     </button>
     {msg && (
      <p className="p-note" style={{ marginTop: '.8rem' }}>
       {msg}
      </p>
     )}
    </>
   ) : (
    <>
     <p className="p-note" style={{ marginBottom: '.8rem' }}>
      Columnas: precio · stock · disponibilidad. Stock vacío (∞) = sin control
      de cantidad. Al venderse la última unidad, el producto pasa solo a
      «Agotado».
     </p>
     {list.map(x => (
      <FilaProducto key={x.id} p={x} />
     ))}
    </>
   )}
  </div>
 )
}

function Owner() {
 const tabs = [
   'Resumen',
   'Comandas',
   'Productos',
   'Pedidos',
   'Usuarios',
   'Club y auditoría',
  ],
  [t, setT] = useState(tabs[0]),
  [f, setF] = useState(hoy())
 const orders = useOrders(),
  { list, err } = useComandas(f),
  day = list.filter(c => c.fecha === f),
  paid = day.filter(esPagada),
  pend = day.filter(c => !esPagada(c)).reduce((s, c) => s + falta(c), 0)

 return (
  <>
   <Tabs list={tabs} t={t} set={setT} />
   {err && (
    <p className="p-note" style={{ margin: '1rem 0' }}>
     No se pudieron leer las comandas ({err}). Revisa las reglas de Firestore y
     que tu correo esté en la lista staff().
    </p>
   )}
   <AnimatePresence mode="wait">
    <View key={t}>
     {t === 'Resumen' && (
      <>
       <DayPicker f={f} set={setF} />
       <Resumen day={paid} pend={pend} />
      </>
     )}
     {t === 'Comandas' && (
      <div className="p-card">
       <h3>Comandas</h3>
       <DayPicker f={f} set={setF} />
       {day.length ? (
        day.map(c => (
         <div key={c.id} className="p-row">
          <span>
           <b>Mesa {c.mesa}</b> · {hora(c)} · {(c.by || '').split('@')[0]}
           <br />
           <small>
            {(c.items || []).map(i => `${i.cant}× ${i.desc}`).join(', ')}
           </small>
          </span>
          <span>
           {bs(c.total)}{' '}
           <span className={'p-badge' + (esPagada(c) ? ' ok' : '')}>
            {esPagada(c)
             ? etiqueta(c)
             : ESTADO[c.estado] +
               (c.cobrado ? ` · cobrado ${bs(c.cobrado)}` : '')}
           </span>
          </span>
         </div>
        ))
       ) : (
        <p>No hay comandas este día.</p>
       )}
       {day.length > 0 && (
        <div className="p-row">
         <b>Total cobrado del día</b>
         <b>{bs(paid.reduce((s, c) => s + c.total, 0))}</b>
        </div>
       )}
      </div>
     )}
     {t === 'Productos' && <Productos />}
     {t === 'Pedidos' && (
      <div className="p-card">
       <h3>Pedidos recientes</h3>
       {orders.length ? (
        orders.map(o => (
         <div key={o.id} className="p-row">
          <span>
           #{o.num} · {o.who} · {o.mod}
           <br />
           <small>{lineasPedido(o)}</small>
          </span>
          <span>
           {money(o.total)}{' '}
           <span className={'p-badge' + (o.st === 4 ? ' ok' : '')}>
            {FLOW[o.st]}
           </span>
          </span>
         </div>
        ))
       ) : (
        <p>Aún no hay pedidos. Pide algo desde la cuenta de un cliente.</p>
       )}
      </div>
     )}
     {t === 'Usuarios' && <Usuarios />}
     {t === 'Club y auditoría' && (
      <>
       <div className="p-grid">
        <Stat l="Sellos emitidos" to={214} />
        <Stat l="Recompensas generadas" to={37} />
        <Stat l="Recompensas canjeadas" to={31} />
        <Stat l="QR vencidos" to={9} />
        <Stat l="Intentos de reutilización" to={2} />
       </div>
       <div className="p-card" style={{ marginTop: '1rem' }}>
        <h3>Registro de auditoría</h3>
        {LOG.map(([h, a, d], i) => (
         <motion.div
          key={i}
          className="p-row"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * .07 }}
         >
          <span>
           <b>{h}</b> · {a}
          </span>
          <span className={'p-badge' + (d.includes('bloqueado') ? ' bad' : '')}>
           {d}
          </span>
         </motion.div>
        ))}
       </div>
      </>
     )}
    </View>
   </AnimatePresence>
  </>
 )
}

// ---- Descarga del historial: archivo CSV que abre Excel (separador «;» y decimales con coma, como en Bolivia) ----
const celda = v => {
 let t = String(v ?? '')
 if (/^[=+\-@]/.test(t)) t = "'" + t // evita que Excel lo tome como fórmula
 return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
}

const num = n => (Number(n) || 0).toFixed(2).replace('.', ',')

function bajarCsv(rows, desde, hasta) {
 const L = [
  [
   'Fecha',
   'Hora',
   'Mesa',
   'Productos',
   'Total (Bs)',
   'Forma de pago',
   'Detalle de pagos',
  ],
 ]
 rows.forEach(c =>
  L.push([
   (c.fecha || '').split('-').reverse().join('/'),
   hora(c),
   c.mesa,
   (c.items || []).map(i => `${i.cant}× ${i.desc}`).join(', '),
   num(c.total),
   etiqueta(c),
   c.pagos?.length
    ? c.pagos.map(p => `${p.metodo} ${num(p.monto)}`).join(' + ')
    : '',
  ])
 )
 L.push([])
 L.push(['RESUMEN'])
 L.push(['Comandas', rows.length])
 L.push([
  'Total vendido (Bs)',
  num(rows.reduce((s, c) => s + (Number(c.total) || 0), 0)),
 ])
 PAGOS.forEach(p => L.push(['Total ' + p + ' (Bs)', num(sumaMetodo(rows, p))]))
 const blob = new Blob(
  ['\ufeff' + L.map(r => r.map(celda).join(';')).join('\r\n')],
  { type: 'text/csv;charset=utf-8' }
 )
 const a = document.createElement('a')
 a.href = URL.createObjectURL(blob)
 a.download =
  desde === hasta
   ? `historial_${desde}.csv`
   : `historial_${desde}_a_${hasta}.csv`
 document.body.appendChild(a)
 a.click()
 a.remove()
 setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const haceDias = n =>
 new Date(Date.now() - n * 864e5).toLocaleDateString('sv-SE')

// Historial del empleado: solo las comandas que registró él (filtro por su correo).
// Se ordena en el cliente para no necesitar un índice compuesto en Firestore.
function Historial({ email }) {
 const [f, setF] = useState(hoy()),
  [st, setSt] = useState({ list: [], err: '' }),
  [desde, setDesde] = useState(hoy()),
  [hasta, setHasta] = useState(hoy()),
  [dl, setDl] = useState({ busy: false, msg: '' })

 // Descarga las comandas pagadas del empleado dentro del lapso elegido (lee de Firestore, no solo lo que se ve en pantalla)
 const descargar = async () => {
  if (!desde || !hasta || desde > hasta)
   return setDl({
    busy: false,
    msg: 'Revisa las fechas: «Desde» no puede ser mayor que «Hasta».',
   })
  const dias = []
  for (
   let d = new Date(desde + 'T12:00:00');
   d <= new Date(hasta + 'T12:00:00');
   d.setDate(d.getDate() + 1)
  )
   dias.push(d.toLocaleDateString('sv-SE'))
  if (dias.length > 93)
   return setDl({ busy: false, msg: 'Elige un lapso de hasta 3 meses.' })
  setDl({ busy: true, msg: '' })
  try {
   const snaps = await Promise.all(
    dias.map(d =>
     getDocs(
      query(
       collection(db, 'comandas'),
       where('by', '==', email),
       where('fecha', '==', d)
      )
     )
    )
   )
   const rows = snaps
    .flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
    .filter(esPagada)
    .sort((a, b) => fechaTs(a) - fechaTs(b))
   if (!rows.length)
    return setDl({
     busy: false,
     msg: 'No hay comandas pagadas en ese lapso.',
    })
   bajarCsv(rows, desde, hasta)
   setDl({
    busy: false,
    msg: `Listo: ${rows.length} ${
     rows.length === 1 ? 'comanda descargada' : 'comandas descargadas'
    }.`,
   })
  } catch (e) {
   setDl({
    busy: false,
    msg: 'No se pudo descargar: ' + (e.code || e.message),
   })
  }
 }

 const lapso = (a, b) => {
  setDesde(a)
  setHasta(b)
  setDl({ busy: false, msg: '' })
 }

 useEffect(() => {
  if (!email) return
  return onSnapshot(
   query(
    collection(db, 'comandas'),
    where('by', '==', email),
    where('fecha', '==', f),
    limit(500)
   ),
   s =>
    setSt({
     list: s.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => fechaTs(b) - fechaTs(a)),
     err: '',
    }),
   e => setSt({ list: [], err: e.code || e.message })
  )
 }, [email, f])

 const day = st.list.filter(c => c.fecha === f && esPagada(c)),
  tot = day.reduce((s, c) => s + c.total, 0)
 const pay = PAGOS.map(p => [p, sumaMetodo(day, p)])

 return (
  <div className="p-card" style={{ marginTop: '1.25rem' }}>
   <h3>
    Mi historial <small>(pedidos pagados)</small>
   </h3>
   <DayPicker f={f} set={setF} />
   {st.err && (
    <p className="p-note">No se pudo leer tu historial ({st.err}).</p>
   )}
   <div className="p-grid">
    <Stat l="Mis ventas" to={tot} fmt={bs} />
    <Stat l="Mis comandas" to={day.length} />
    {pay.map(([p, v]) => (
     <Stat key={p} l={p} to={v} fmt={bs} />
    ))}
   </div>
   <div
    style={{
     marginTop: '1rem',
     padding: '.9rem 1rem',
     borderRadius: 12,
     background: 'rgba(128,128,128,.1)',
    }}
   >
    <b>Descargar historial</b>
    <div
     style={{
      display: 'flex',
      gap: '.8rem',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      margin: '.7rem 0',
     }}
    >
     <label className="p-note" style={{ display: 'grid', gap: '.25rem' }}>
      Desde
      <input
       type="date"
       value={desde}
       max={hasta || undefined}
       onChange={e => {
        setDesde(e.target.value)
        setDl({ busy: false, msg: '' })
       }}
      />
     </label>
     <label className="p-note" style={{ display: 'grid', gap: '.25rem' }}>
      Hasta
      <input
       type="date"
       value={hasta}
       min={desde || undefined}
       onChange={e => {
        setHasta(e.target.value)
        setDl({ busy: false, msg: '' })
       }}
      />
     </label>
     <button className="btn red" disabled={dl.busy} onClick={descargar}>
      {dl.busy ? 'Preparando…' : '⬇ Descargar'}
     </button>
    </div>
    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
     <button type="button" className="btn alt" onClick={() => lapso(hoy(), hoy())}>
      Hoy
     </button>
     <button
      type="button"
      className="btn alt"
      onClick={() => lapso(haceDias(6), hoy())}
     >
      Últimos 7 días
     </button>
     <button
      type="button"
      className="btn alt"
      onClick={() => lapso(hoy().slice(0, 8) + '01', hoy())}
     >
      Este mes
     </button>
    </div>
    {dl.msg && (
     <p className="p-note" role="status" style={{ marginTop: '.7rem' }}>
      {dl.msg}
     </p>
    )}
    <p className="p-note" style={{ marginTop: '.5rem' }}>
     Para un solo día, pon la misma fecha en «Desde» y «Hasta». Incluye solo
     comandas pagadas, con un resumen al final.
    </p>
   </div>
   <div style={{ marginTop: '1rem' }}>
    {day.length ? (
     day.map(c => (
      <div key={c.id} className="p-row">
       <span>
        <b>Mesa {c.mesa}</b> · {hora(c)}
        <br />
        <small>
         {(c.items || []).map(i => `${i.cant}× ${i.desc}`).join(', ')}
        </small>
        {c.pagos?.length > 0 && (
         <>
          <br />
          <small>
           {c.pagos.map(p => `${p.metodo} ${bs(p.monto)}`).join(' + ')}
          </small>
         </>
        )}
       </span>
       <span>
        {bs(c.total)} <span className="p-badge">{etiqueta(c)}</span>
       </span>
      </div>
     ))
    ) : (
     <p>No registraste comandas este día.</p>
    )}
   </div>
  </div>
 )
}

function Employee({ email }) {
 const orders = useOrders(),
  { list: menu } = useMenu(),
  [sale, setSale] = useState({}),
  [qr, setQr] = useState(null),
  [left, setLeft] = useState(0),
  [code, setCode] = useState(''),
  [msg, setMsg] = useState(''),
  [cw, setCw] = useState(null)

 const gen = async t => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
   r = crypto.getRandomValues(new Uint8Array(6)),
   n = [...r].map(x => A[x % A.length]).join('')
  try {
   await setDoc(doc(db, 'codes', n), {
    code: n,
    by: auth.currentUser.email,
    amt: t,
    used: false,
    exp: Timestamp.fromMillis(Date.now() + 600000),
    ts: serverTimestamp(),
   })
   setQr({ n, tot: t })
   setLeft(600)
   setSale({})
  } catch (e) {
   alert('No se pudo crear el código: ' + e.code)
  }
 }

 const busy = useRef(new Set()),
  qrRef = useRef(null)

 // Copia el pedido web entregado al historial de comandas (id fijo "web-<id>" para no duplicarlo)
 // Guarda también cómo se cobró (método, o varios si la cuenta se dividió). Si no hay dato de cobro queda "Web".
 const espejo = async id => {
  const o = (await getDoc(doc(db, 'orders', id))).data()
  if (!o) return
  const extra = o.pagos?.length
   ? {
      pagos: o.pagos,
      cobrado: o.cobrado,
      modo: o.modo,
      ...(o.partes ? { partes: o.partes } : {}),
     }
   : {}
  await setDoc(doc(db, 'comandas', 'web-' + id), {
   mesa: 'Web #' + o.num,
   fecha: hoy(),
   items: (o.items || []).map(i => ({
    cant: i.q,
    desc: i.n,
    pu: i.p,
    importe: i.q * i.p,
   })),
   total: o.total,
   estado: 'pagado',
   pago: o.pago || 'Web',
   origen: 'web',
   orderId: id,
   by: email,
   ts: serverTimestamp(),
   pagadoAt: serverTimestamp(),
   ...extra,
  })
 }

 // Al aceptar un pedido web se descuenta el stock de los productos que lleven control de cantidad.
 // Todo en una sola operación; si no alcanzaba el stock, se acepta igual y se avisa al empleado.
 const byName = Object.fromEntries(menu.map(x => [x.name, x]))

 const aceptar = async id => {
  const orf = doc(db, 'orders', id),
   faltan = []
  await runTransaction(db, async tx => {
   faltan.length = 0
   const o = (await tx.get(orf)).data()
   if (!o) throw new Error('El pedido ya no existe')
   const want = {}
   ;(o.items || []).forEach(i => {
    const mid = i.id ?? byName[i.n]?.id
    if (mid != null) want[mid] = (want[mid] || 0) + (Number(i.q) || 0)
   })
   const ids = Object.keys(want),
    refs = ids.map(m => doc(db, 'menu', m))
   const snaps = await Promise.all(refs.map(r => tx.get(r)))
   const ups = []
   snaps.forEach((sn, k) => {
    if (!sn.exists()) return
    const d = sn.data()
    if (typeof d.stock !== 'number') return
    const q = want[ids[k]]
    if (d.stock < q) faltan.push(`${d.name} (quedaban ${d.stock}, pidió ${q})`)
    const n = Math.max(0, d.stock - q)
    if (n < d.stock)
     ups.push([refs[k], n === 0 ? { stock: 0, out: true } : { stock: n }])
   })
   ups.forEach(([r, data]) => tx.update(r, data))
   tx.update(orf, { st: increment(1), by: email })
  })
  if (faltan.length)
   alert(
    'Atención: no alcanzaba el stock de ' +
     faltan.join(', ') +
     '. Avisa al cliente.'
   )
 }

 const adv = async (id, st, t) => {
  if (busy.current.has(id)) return
  busy.current.add(id)
  try {
   if (st === 0) await aceptar(id)
   else await updateDoc(doc(db, 'orders', id), { st: increment(1), by: email })
  } catch (e) {
   alert('No se pudo actualizar el pedido: ' + (e.code || e.message))
  } finally {
   busy.current.delete(id)
  }
 }

 // Cobro de un pedido web (Listo → Entregado): cuenta completa, partes iguales o por consumo, igual que en "Pedidos en curso"
 const cobroO = cw ? orders.find(x => x.id === cw && x.st === 3) : null
 const cobroC = cobroO && {
  id: cobroO.id,
  total: Number(cobroO.total) || 0,
  items: (cobroO.items || []).map(i => ({ cant: i.q, desc: i.n, pu: i.p })),
  pagos: cobroO.pagos,
  cobrado: cobroO.cobrado,
  modo: cobroO.modo,
  partes: cobroO.partes,
 }

 const guardarWeb = async (data, final) => {
  const o = cobroO
  if (!o) return
  const orf = doc(db, 'orders', o.id)
  if (!final) {
   await updateDoc(orf, data)
   return
  }
  await updateDoc(orf, { ...data, st: increment(1), by: email }) // pasa a Entregado
  await espejo(o.id)
  gen(o.total)
  setCw(null)
 }

 const cwRef = useRef(null)
 useEffect(() => {
  if (cw) cwRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
 }, [cw])
 useEffect(() => {
  if (qr) qrRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
 }, [qr])
 useEffect(() => {
  if (!qr) return
  const i = setInterval(() => setLeft(l => Math.max(0, l - 1)), 1000)
  return () => clearInterval(i)
 }, [qr])

 const tot = menu
  .filter(p => sale[p.id])
  .reduce((s, p) => s + p.price * sale[p.id], 0)

 return (
  <>
   {qr && (
    <motion.div
     ref={qrRef}
     key={qr.n}
     className="p-card"
     initial={{ opacity: 0, scale: .95 }}
     animate={{ opacity: 1, scale: 1 }}
     style={{ marginBottom: '1.25rem', textAlign: 'center' }}
    >
     <h3>QR del Club · entrégalo al cliente</h3>
     <QrImg text={qr.n} dead={!left} />
     <div className="p-time" style={{ letterSpacing: '.2em' }}>
      {qr.n}
     </div>
     <div className="p-time" style={{ fontSize: '1.1rem' }}>
      vence en {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
     </div>
     <p className="p-note">
      Código de sello · {money(qr.tot)} · un solo uso · válido 10 min
     </p>
     <button className="btn alt" onClick={() => setQr(null)}>
      Cerrar
     </button>
    </motion.div>
   )}

   <Comanda />
   <EnCurso email={email} onPaid={gen} />
   <Historial email={email} />

   {cobroO && (
    <div
     ref={cwRef}
     key={cobroO.id}
     className="p-card"
     style={{ marginTop: '1.25rem' }}
    >
     <div className="seg-head">
      <h3>Cobro del pedido web #{cobroO.num}</h3>
      <span className="p-badge">{money(cobroO.total)}</span>
     </div>
     <p className="p-note" style={{ marginBottom: '.8rem' }}>
      {cobroO.who} · {lineasPedido(cobroO)}
     </p>
     <ResumenCobro c={cobroC} />
     <Cobro c={cobroC} onSave={guardarWeb} onClose={() => setCw(null)} />
    </div>
   )}

   <div className="p-two" style={{ marginTop: '1.25rem' }}>
    <div className="p-card">
     <h3>Pedidos digitales</h3>
     <AnimatePresence>
      {orders
       .filter(o => o.st < 4)
       .map(o => (
        <motion.div
         key={o.id}
         layout
         className="p-row"
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         exit={{ opacity: 0, x: 60 }}
        >
         <span>
          #{o.num} · {o.who}
          <br />
          <b>{lineasPedido(o) || '(sin detalle)'}</b>
          <br />
          <small>
           {o.mod} · {money(o.total)}
           {o.cobrado > 0 && ` · cobrado ${money(o.cobrado)}`}
          </small>
         </span>
         <span style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
          <span className="p-badge">{FLOW[o.st]}</span>
          <motion.button
           whileTap={{ scale: .92 }}
           className="btn red"
           onClick={() =>
            o.st === 3 ? setCw(o.id) : adv(o.id, o.st, o.total)
           }
          >
           {o.st === 3 ? 'Cobrar y entregar' : FLOW[o.st + 1]}
          </motion.button>
         </span>
        </motion.div>
       ))}
     </AnimatePresence>
     {orders.every(o => o.st === 4) && (
      <p>Sin pedidos pendientes. Todo entregado.</p>
     )}
    </div>

    <div className="p-card">
     <h3>Venta presencial (sellos)</h3>
     <div className="p-chips">
      {menu
       .filter(p => !agotado(p))
       .map(p => (
        <motion.button
         key={p.id}
         whileTap={{ scale: .92 }}
         onClick={() => setSale(s => ({ ...s, [p.id]: (s[p.id] || 0) + 1 }))}
        >
         {p.emoji} {p.name}
         {sale[p.id] ? ` ×${sale[p.id]}` : ''}
        </motion.button>
       ))}
     </div>
     <div className="p-row">
      <b>Total</b>
      <b>{money(tot)}</b>
     </div>
     <button
      className="btn red"
      style={{ marginTop: '.8rem' }}
      disabled={!tot}
      onClick={() => gen(tot)}
     >
      Registrar venta y generar QR
     </button>
    </div>
   </div>

   <div className="p-card" style={{ marginTop: '1.25rem' }}>
    <h3>Validar canje de café gratis</h3>
    <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap' }}>
     <input
      style={{ width: 'min(260px,100%)' }}
      placeholder="Código del cliente"
      aria-label="Código del cliente"
      value={code}
      onChange={e => setCode(e.target.value)}
     />
     <button
      className="btn red"
      onClick={() =>
       setMsg(
        code.trim()
         ? `Canje ${code} validado. Entrega el café.`
         : 'Escribe el código del cliente.'
       )
      }
     >
      Validar canje
     </button>
    </div>
    {msg && (
     <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ marginTop: '.8rem' }}
     >
      {msg}
     </motion.p>
    )}
    <p className="p-note" style={{ marginTop: '.8rem' }}>
     Demo: en la versión real el servidor valida el canje y registra al
     empleado.
    </p>
   </div>
  </>
 )
}

export default function Panels() {
 const sess = useSession(),
  [pick, setPick] = useState(null)

 if (sess === undefined)
  return (
   <p className="p-note" style={{ padding: '2rem' }}>
    Cargando…
   </p>
  )

 if (!sess || sess.role === 'Cliente')
  return (
   <div className="p-app">
    <div className="p-main" style={{ maxWidth: 420 }}>
     <h3 style={{ marginBottom: '1rem' }}>Acceso del personal</h3>
     <div className="p-card">
      <LoginForm onDone={() => {}} />
     </div>
     <p className="p-note" style={{ marginTop: '1rem' }}>
      {sess ? 'Esta cuenta no es del personal. ' : ''}
      <a href="#">Volver al sitio</a>
     </p>
    </div>
   </div>
  )

 const role = sess.role === 'Propietario' ? pick || 'Propietario' : 'Empleado'

 return (
  <MotionConfig reducedMotion="user">
   <div className="p-app">
    <header className="p-top">
     <b className="p-brand">Kimsa Charani · Panel</b>
     <div className="p-roles">
      {(sess.role === 'Propietario'
       ? ['Propietario', 'Empleado']
       : ['Empleado']
      ).map(r => (
       <button key={r} onClick={() => setPick(r)}>
        {r === role && <motion.span layoutId="prole" className="pill" />}
        {r}
       </button>
      ))}
     </div>
     <a href="#">Volver al sitio</a>
     <button className="btn alt" onClick={() => signOut(auth)}>
      Salir
     </button>
    </header>
    <main className="p-main">
     <p className="p-note">
      Sesión: {sess.email} ({sess.role}). Las comandas y los pedidos son reales;
      el resto de datos del panel son de ejemplo.
     </p>
     <AnimatePresence mode="wait">
      <motion.div
       key={role}
       initial={{ opacity: 0, y: 10 }}
       animate={{ opacity: 1, y: 0 }}
       exit={{ opacity: 0 }}
      >
       {role === 'Propietario' ? <Owner /> : <Employee email={sess.email} />}
      </motion.div>
     </AnimatePresence>
    </main>
   </div>
  </MotionConfig>
 )
}