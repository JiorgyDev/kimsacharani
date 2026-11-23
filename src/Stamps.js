import { doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './fb'

// Valida un código (escrito o leído del QR) y acredita 1 sello. Un código sirve una sola vez.
export async function redeem(raw) {
 const code = (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
 if (!code) throw new Error('Escribe el código.')
 const ref = doc(db, 'codes', code),
  snap = await getDoc(ref)
 if (!snap.exists()) throw new Error('Código no válido.')
 const d = snap.data()
 if (d.used) throw new Error('Este código ya fue usado.')
 if (d.exp.toMillis() < Date.now()) throw new Error('Este código expiró.')
 const uid = auth.currentUser.uid,
  b = writeBatch(db)
 b.update(ref, { used: true, usedBy: uid, usedAt: serverTimestamp() })
 b.set(doc(db, 'stamps', code), { uid, code, ts: serverTimestamp() })
 await b.commit()
}