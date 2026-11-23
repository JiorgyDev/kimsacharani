import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import {
 collection,
 doc,
 onSnapshot,
 query,
 where,
 orderBy,
 limit,
} from 'firebase/firestore'
import { auth, db, roleOf, ROL } from './fb'

export function useSession() {
 const [s, setS] = useState(undefined)

 useEffect(() => {
  let off = () => {}
  const un = onAuthStateChanged(auth, u => {
   off()
   off = () => {}
   if (!u) {
    setS(null)
    return
   }
   const base = { uid: u.uid, email: u.email, name: u.email.split('@')[0] }
   // Se espera el documento del usuario para conocer su rol (así no parpadea "no es del personal").
   // Si no existe (cuentas antiguas o correos semilla) se usa roleOf(email).
   const fallback = () => setS({ ...base, role: roleOf(u.email) })
   off = onSnapshot(
    doc(db, 'users', u.uid),
    d => {
     if (!d.exists()) return fallback()
     const x = d.data()
     setS({
      ...base,
      name: x.nombre ? x.nombre.split(' ')[0] : base.name,
      role:
       x.activo === false ? 'Cliente' : ROL[x.rol] || roleOf(u.email),
     })
    },
    fallback
   )
  })
  return () => {
   off()
   un()
  }
 }, [])

 return s
}

// Pedidos web para el personal. Ya no se lee toda la historia (crecía sin parar):
// 1) todos los pedidos pendientes (todavía no entregados), sin importar su antigüedad
// 2) los 30 más recientes, para ver los últimos entregados
// Se juntan sin repetir y quedan ordenados del más nuevo al más viejo.
export function useOrders() {
 const [pend, setPend] = useState([]),
  [rec, setRec] = useState([])
 const rows = s => s.docs.map(d => ({ id: d.id, ...d.data() }))

 useEffect(
  () =>
   onSnapshot(
    query(collection(db, 'orders'), where('st', '<', 4), limit(200)),
    s => setPend(rows(s)),
    () => setPend([])
   ),
  []
 )

 useEffect(
  () =>
   onSnapshot(
    query(collection(db, 'orders'), orderBy('ts', 'desc'), limit(30)),
    s => setRec(rows(s)),
    () => setRec([])
   ),
  []
 )

 const m = new Map()
 ;[...rec, ...pend].forEach(o => m.set(o.id, o))
 return [...m.values()].sort(
  (a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0)
 )
}

export function useStamps(uid) {
 const [n, setN] = useState(0)

 useEffect(() => {
  if (!uid) {
   setN(0)
   return
  }
  return onSnapshot(
   query(collection(db, 'stamps'), where('uid', '==', uid)),
   s => setN(s.size),
   () => setN(0)
  )
 }, [uid])

 return n
}