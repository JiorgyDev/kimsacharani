import { useState, useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from './fb'
import { PRODUCTS } from './data'

// Un producto está agotado si el propietario lo marcó, o si lleva control de cantidad y ya no quedan.
// stock: número = unidades disponibles · null o ausente = sin control de cantidad.
export const agotado = p =>
 !!p.out || (typeof p.stock === 'number' && p.stock <= 0)

// Menú en tiempo real desde Firestore (colección "menu").
// Mientras el propietario no lo haya cargado (o si falla la lectura) se usa data.js, así nada se rompe.
export default function useMenu() {
 const [st, setSt] = useState({ list: PRODUCTS, live: false, err: '' })

 useEffect(
  () =>
   onSnapshot(
    collection(db, 'menu'),
    s => {
     if (s.empty) {
      setSt({ list: PRODUCTS, live: false, err: '' })
      return
     }
     setSt({
      list: s.docs.map(d => d.data()).sort((a, b) => a.id - b.id),
      live: true,
      err: '',
     })
    },
    e => setSt({ list: PRODUCTS, live: false, err: e.code || e.message })
   ),
  []
 )

 return st
}