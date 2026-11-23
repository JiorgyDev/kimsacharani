import { useState } from 'react'
import {
 signInWithEmailAndPassword,
 createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth, roleOf } from './fb'

export default function LoginForm({ onDone }) {
 const [m, setM] = useState('in'),
  [e, setE] = useState(''),
  [p, setP] = useState(''),
  [err, setErr] = useState(''),
  [busy, setBusy] = useState(false)

 const go = async () => {
  setErr('')
  setBusy(true)
  try {
   const f = m === 'in' ? signInWithEmailAndPassword : createUserWithEmailAndPassword
   const r = await f(auth, e.trim(), p)
   onDone(roleOf(r.user.email))
  } catch (x) {
   setErr(
    x.code === 'auth/weak-password'
     ? 'La contraseña necesita 6 caracteres o más.'
     : x.code === 'auth/email-already-in-use'
     ? 'Ese correo ya tiene cuenta.'
     : 'Correo o contraseña incorrectos.'
   )
  }
  setBusy(false)
 }

 return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
   <h3>{m === 'in' ? 'Ingresar' : 'Crear cuenta de cliente'}</h3>
   <input
    style={{ width: '100%' }}
    type="email"
    placeholder="Correo electrónico"
    aria-label="Correo"
    value={e}
    onChange={x => setE(x.target.value)}
   />
   <input
    style={{ width: '100%' }}
    type="password"
    placeholder="Contraseña"
    aria-label="Contraseña"
    value={p}
    onChange={x => setP(x.target.value)}
    onKeyDown={x => x.key === 'Enter' && go()}
   />
   {err && (
    <p style={{ color: 'var(--red)', fontSize: '.9rem' }} role="alert">
     {err}
    </p>
   )}
   <button className="btn red" disabled={busy || !e || !p} onClick={go}>
    {busy ? 'Un momento…' : m === 'in' ? 'Ingresar' : 'Crear cuenta'}
   </button>
   <button
    style={{
     background: 'none',
     textDecoration: 'underline',
     color: 'inherit',
    }}
    onClick={() => {
     setM(m === 'in' ? 'up' : 'in')
     setErr('')
    }}
   >
    {m === 'in' ? '¿No tienes cuenta? Créala' : 'Ya tengo cuenta'}
   </button>
  </div>
 )
}