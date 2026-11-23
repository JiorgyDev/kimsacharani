import { useState } from 'react'
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db, auth } from './fb'
import useMenu, { agotado } from './useMenu'
import './Comanda.css'

// El menú ahora viene de Firestore (useMenu). Aquí solo se define el orden y el ícono de cada categoría.
const CATS = [
 ['Cafés', '☕'],
 ['Bebidas', '🍹'],
 ['Dulces', '🍰'],
 ['Salados', '🥪'],
]

const bs = n => 'Bs ' + n.toFixed(2)
const hoy = () => new Date().toLocaleDateString('sv-SE')

export default function Comanda() {
 const { list } = useMenu()
 const MENU = CATS.map(([cat, ico]) => ({
  cat,
  ico,
  items: list.filter(p => p.cat === cat),
 }))
 const byName = Object.fromEntries(list.map(p => [p.name, p]))
 const [mesa, setMesa] = useState(''),
  [fecha, setFecha] = useState(hoy()),
  [lines, setLines] = useState({}),
  [cat, setCat] = useState(CATS[0][0]),
  [q, setQ] = useState(''),
  [msg, setMsg] = useState(null),
  [busy, setBusy] = useState(false)

 const rows = Object.entries(lines).map(([d, l]) => ({
  d,
  q: l.q,
  p: l.p,
  id: l.id,
  imp: l.q * l.p,
 }))
 const total = rows.reduce((s, r) => s + r.imp, 0),
  unidades = rows.reduce((s, r) => s + r.q, 0)
 const shown = q.trim()
  ? list.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()))
  : MENU.find(m => m.cat === cat)?.items || []
 const tope = p => (typeof p?.stock === 'number' ? p.stock : Infinity) // cuántas unidades se pueden pedir como máximo

 const add = pr => {
  setMsg(null)
  if (agotado(pr)) return
  if ((lines[pr.name]?.q || 0) >= tope(pr))
   return setMsg({ t: 'err', x: `Solo quedan ${pr.stock} de ${pr.name}.` })
  setLines(s => ({
   ...s,
   [pr.name]: { p: pr.price, id: pr.id, q: (s[pr.name]?.q || 0) + 1 },
  }))
 }

 const change = (d, n) => {
  if (n > 0 && lines[d].q >= tope(byName[d]))
   return setMsg({ t: 'err', x: `Solo quedan ${byName[d].stock} de ${d}.` })
  setLines(s => {
   const k = s[d].q + n,
    c = { ...s }
   if (k <= 0) delete c[d]
   else c[d] = { ...c[d], q: k }
   return c
  })
 }

 const clear = () => {
  setLines({})
  setMesa('')
  setFecha(hoy())
  setQ('')
 }

 // Toma el pedido: guarda la comanda ("tomado", sin pago) y descuenta el stock de los productos
 // que lleven control de cantidad, todo en una sola operación (si algo falla, no se guarda nada).
 const save = async () => {
  if (!mesa.trim()) return setMsg({ t: 'err', x: 'Escribe el número de mesa.' })
  if (!rows.length) return setMsg({ t: 'err', x: 'Agrega al menos un producto.' })
  setBusy(true)
  try {
   await runTransaction(db, async tx => {
    const refs = rows
     .filter(r => r.id != null)
     .map(r => [r, doc(db, 'menu', String(r.id))])
    const snaps = await Promise.all(refs.map(([, rf]) => tx.get(rf)))
    const ups = []
    snaps.forEach((s, i) => {
     const r = refs[i][0]
     if (!s.exists()) return
     const d = s.data()
     if (typeof d.stock !== 'number') return // sin control de cantidad
     if (d.stock < r.q) throw new Error('STOCK|' + r.d + '|' + d.stock)
     const n = d.stock - r.q
     ups.push([refs[i][1], n === 0 ? { stock: 0, out: true } : { stock: n }])
    })
    ups.forEach(([rf, data]) => tx.update(rf, data))
    tx.set(doc(collection(db, 'comandas')), {
     mesa: mesa.trim(),
     fecha,
     items: rows.map(r => ({
      cant: r.q,
      desc: r.d,
      pu: r.p,
      importe: r.imp,
      id: r.id ?? null,
     })),
     total,
     estado: 'tomado',
     pago: '',
     by: auth.currentUser?.email || '',
     ts: serverTimestamp(),
    })
   })
   clear()
   setMsg({ t: 'ok', x: 'Pedido tomado ✓ Ya aparece en "Pedidos en curso".' })
  } catch (e) {
   const m = String(e.message || '')
   if (m.startsWith('STOCK|')) {
    const [, n, s] = m.split('|')
    setMsg({
     t: 'err',
     x: `No alcanza el stock de ${n} (quedan ${s}). Ajusta la cantidad.`,
    })
   } else setMsg({ t: 'err', x: 'No se pudo guardar: ' + (e.code || e.message) })
  }
  setBusy(false)
 }

 const print = () => {
  if (!rows.length) return setMsg({ t: 'err', x: 'Agrega al menos un producto.' })
  window.print()
 }

 return (
  <section className="cmd">
   <div className="cmd-grid">
    <div className="p-card cmd-menu">
     <div className="cmd-title">
      <h3>Nueva comanda</h3>
      <small>Toca un producto para agregarlo</small>
     </div>
     <input
      className="cmd-search"
      type="search"
      value={q}
      onChange={e => setQ(e.target.value)}
      placeholder="Buscar en el menú…"
      aria-label="Buscar en el menú"
     />
     {!q.trim() && (
      <div className="cmd-cats" role="tablist">
       {MENU.map(m => (
        <button
         key={m.cat}
         role="tab"
         aria-selected={m.cat === cat}
         className={m.cat === cat ? 'on' : ''}
         onClick={() => setCat(m.cat)}
        >
         <span aria-hidden="true">{m.ico}</span> {m.cat}
        </button>
       ))}
      </div>
     )}
     <div className="cmd-items">
      {shown.length ? (
       shown.map(p => {
        const ag = agotado(p)
        return (
         <button
          key={p.id}
          className={lines[p.name] ? 'on' : ''}
          disabled={ag}
          style={ag ? { opacity: .45 } : null}
          onClick={() => add(p)}
         >
          <span className="n">
           {p.name}
           {typeof p.stock === 'number' && !ag && (
            <small style={{ display: 'block', opacity: .7 }}>
             quedan {p.stock}
            </small>
           )}
          </span>
          <span className="p">{ag ? 'Agotado' : bs(p.price)}</span>
          {lines[p.name] && <i>{lines[p.name].q}</i>}
         </button>
        )
       })
      ) : (
       <p className="cmd-empty">Sin resultados.</p>
      )}
     </div>
    </div>

    <aside className="p-card cmd-ticket">
     <div className="cmd-head">
      <label>
       Mesa
       <input
        value={mesa}
        onChange={e => setMesa(e.target.value)}
        placeholder="Nº"
        inputMode="numeric"
        className="mesa"
       />
      </label>
      <label>
       Fecha
       <input
        type="date"
        value={fecha}
        onChange={e => setFecha(e.target.value)}
       />
      </label>
     </div>

     <div className="cmd-lines">
      {rows.length ? (
       rows.map(r => (
        <div key={r.d} className="cmd-line">
         <div className="top">
          <span className="d">{r.d}</span>
          <b>{bs(r.imp)}</b>
         </div>
         <div className="bot">
          <span className="cmd-qty">
           <button
            aria-label={'Quitar uno de ' + r.d}
            onClick={() => change(r.d, -1)}
           >
            −
           </button>
           <b>{r.q}</b>
           <button
            aria-label={'Agregar uno de ' + r.d}
            onClick={() => change(r.d, 1)}
           >
            +
           </button>
          </span>
          <small>
           {r.q} × {bs(r.p)}
          </small>
         </div>
        </div>
       ))
      ) : (
       <p className="cmd-empty">Aún no hay productos.</p>
      )}
     </div>

     <div className="cmd-total">
      <span>
       Total{' '}
       <small>
        ({unidades} {unidades === 1 ? 'ítem' : 'ítems'})
       </small>
      </span>
      <b>{bs(total)}</b>
     </div>

     {msg && (
      <p className={'cmd-msg ' + msg.t} role="status">
       {msg.x}
      </p>
     )}
     <div className="cmd-actions">
      <button className="btn red" onClick={save} disabled={busy}>
       {busy ? 'Guardando…' : 'Tomar pedido'}
      </button>
      <button className="btn alt" onClick={print}>
       Imprimir
      </button>
      <button className="btn alt" onClick={clear} disabled={!rows.length && !mesa}>
       Limpiar
      </button>
     </div>
    </aside>
   </div>

   {/* Ticket de cocina: solo se ve al imprimir */}
   <div className="cmd-print">
    <h2>Kimsa Charani</h2>
    <p>
     COMANDA · Mesa: <b>{mesa || '—'}</b> · {fecha.split('-').reverse().join('/')}
    </p>
    <table>
     <thead>
      <tr>
       <th>Cant</th>
       <th>Descripción</th>
       <th>P.U.</th>
       <th>Importe</th>
      </tr>
     </thead>
     <tbody>
      {rows.map(r => (
       <tr key={r.d}>
        <td>{r.q}</td>
        <td>{r.d}</td>
        <td>{r.p.toFixed(2)}</td>
        <td>{r.imp.toFixed(2)}</td>
       </tr>
      ))}
     </tbody>
     <tfoot>
      <tr>
       <td colSpan="3">TOTAL</td>
       <td>{bs(total)}</td>
      </tr>
     </tfoot>
    </table>
   </div>
  </section>
 )
}