import { useState, useEffect } from 'react'
import {
 createUserWithEmailAndPassword,
 sendPasswordResetEmail,
 signOut,
 deleteUser,
} from 'firebase/auth'
import {
 doc,
 getDoc,
 writeBatch,
 serverTimestamp,
 collection,
 onSnapshot,
 updateDoc,
} from 'firebase/firestore'
import { auth, createAuth, db } from './fb'
import './Usuarios.css'

const VACIO = {
 rol: 'cliente',
 nombre: '',
 usuario: '',
 telefono: '',
 cumple: '',
 email: '',
}
const TIPOS = [
 ['cliente', 'Nuevo cliente'],
 ['empleado', 'Nuevo empleado'],
]
const ROL = {
 propietario: 'Propietario',
 empleado: 'Empleado',
 cliente: 'Cliente',
}

// Clave temporal aleatoria: nadie la ve. La persona crea la suya con el correo que le llega.
const clave = () => {
 const A = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$',
  r = crypto.getRandomValues(new Uint8Array(24))
 return [...r].map(x => A[x % A.length]).join('')
}

const fechaCorta = s => (s ? s.split('-').reverse().join('/') : '—')

function validar(f) {
 if (f.nombre.trim().length < 2) return 'Escribe el nombre completo.'
 if (!/^[a-z0-9._]{3,20}$/.test(f.usuario.trim().toLowerCase()))
  return 'El usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.'
 if (!/^[0-9+ ]{7,15}$/.test(f.telefono.trim()))
  return 'El teléfono debe tener de 7 a 15 dígitos.'
 if (!f.cumple) return 'Elige la fecha de cumpleaños.'
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
  return 'Escribe un correo válido.'
 return ''
}

const traducir = x =>
 ({
  'usuario-existe': 'Ese nombre de usuario ya existe. Elige otro.',
  'auth/email-already-in-use': 'Ese correo ya tiene una cuenta.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/operation-not-allowed':
   'Activa el acceso con correo y contraseña en Firebase Authentication.',
  'permission-denied':
   'Sin permiso. Revisa que publicaste las reglas nuevas de Firestore.',
 }[x.code] || 'No se pudo crear el usuario: ' + (x.code || x.message))

export default function Usuarios() {
 const [f, setF] = useState(VACIO),
  [msg, setMsg] = useState(null),
  [busy, setBusy] = useState(false),
  [list, setList] = useState([]),
  [err, setErr] = useState(''),
  [filtro, setFiltro] = useState('todos')
 const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))

 useEffect(
  () =>
   onSnapshot(
    collection(db, 'users'),
    s => {
     setList(
      s.docs
       .map(d => ({ id: d.id, ...d.data() }))
       .sort((a, b) => (b.creado?.seconds || 0) - (a.creado?.seconds || 0))
     )
     setErr('')
    },
    e => setErr(e.code || e.message)
   ),
  []
 )

 const crear = async () => {
  setMsg(null)
  const v = validar(f)
  if (v) return setMsg({ t: 'err', x: v })
  const usuario = f.usuario.trim().toLowerCase(),
   email = f.email.trim().toLowerCase()
  setBusy(true)
  let cred = null
  try {
   if ((await getDoc(doc(db, 'usernames', usuario))).exists())
    throw { code: 'usuario-existe' }
   // 1) Cuenta de acceso (en la segunda instancia, sin tocar la sesión del propietario)
   cred = await createUserWithEmailAndPassword(createAuth, email, clave())
   // 2) Datos en Firestore: el usuario y su nombre de usuario (único), en una sola operación
   const b = writeBatch(db)
   b.set(doc(db, 'usernames', usuario), { uid: cred.user.uid })
   b.set(doc(db, 'users', cred.user.uid), {
    nombre: f.nombre.trim(),
    usuario,
    telefono: f.telefono.trim(),
    cumple: f.cumple,
    email,
    rol: f.rol,
    activo: true,
    creadoPor: auth.currentUser.email,
    creado: serverTimestamp(),
   })
   await b.commit()
   // 3) Correo para que la persona ponga su propia contraseña
   let mail = true
   try {
    await sendPasswordResetEmail(createAuth, email)
   } catch {
    mail = false
   }
   setF(VACIO)
   setMsg({
    t: 'ok',
    x:
     `${ROL[f.rol]} creado ✓ ` +
     (mail
      ? `Le enviamos un correo a ${email} para que elija su contraseña.`
      : 'No se pudo enviar el correo: puede usar "Olvidé mi contraseña" al ingresar.'),
   })
  } catch (x) {
   if (cred) {
    try {
     await deleteUser(cred.user)
    } catch {}
   } // no dejar una cuenta sin datos
   setMsg({ t: 'err', x: traducir(x) })
  } finally {
   try {
    await signOut(createAuth)
   } catch {}
   setBusy(false)
  }
 }

 const toggle = async u => {
  try {
   await updateDoc(doc(db, 'users', u.id), { activo: u.activo === false })
  } catch (e) {
   setMsg({ t: 'err', x: traducir(e) })
  }
 }

 const vista = list.filter(u => filtro === 'todos' || u.rol === filtro)

 return (
  <div className="usr">
   <div className="p-card">
    <h3>Crear usuario</h3>
    <div className="usr-tipo" role="radiogroup" aria-label="Tipo de usuario">
     {TIPOS.map(([k, l]) => (
      <label key={k} className={f.rol === k ? 'on' : ''}>
       <input
        type="radio"
        name="tipo"
        checked={f.rol === k}
        onChange={() => setF(s => ({ ...s, rol: k }))}
       />
       {l}
      </label>
     ))}
    </div>
    <div className="usr-form">
     <label>
      Nombre completo
      <input
       value={f.nombre}
       onChange={set('nombre')}
       autoComplete="off"
       placeholder="Ej. María Quispe"
      />
     </label>
     <label>
      Usuario
      <input
       value={f.usuario}
       onChange={set('usuario')}
       autoComplete="off"
       placeholder="Ej. maria.q"
      />
     </label>
     <label>
      Teléfono
      <input
       value={f.telefono}
       onChange={set('telefono')}
       inputMode="tel"
       autoComplete="off"
       placeholder="Ej. 73732723"
      />
     </label>
     <label>
      Fecha de cumpleaños
      <input type="date" value={f.cumple} onChange={set('cumple')} />
     </label>
     <label className="full">
      Email
      <input
       type="email"
       value={f.email}
       onChange={set('email')}
       autoComplete="off"
       placeholder="correo@ejemplo.com"
      />
     </label>
    </div>
    <p className="p-note">
     No se pide contraseña: la persona recibe un correo para crear la suya.
    </p>
    {msg && (
     <p className={'cmd-msg ' + msg.t} role="status">
      {msg.x}
     </p>
    )}
    <button className="btn red" onClick={crear} disabled={busy}>
     {busy ? 'Creando…' : `Crear ${f.rol === 'empleado' ? 'empleado' : 'cliente'}`}
    </button>
   </div>

   <div className="p-card" style={{ marginTop: '1.25rem' }}>
    <div className="usr-head">
     <h3>
      Usuarios <span className="p-badge">{vista.length}</span>
     </h3>
     <select
      value={filtro}
      onChange={e => setFiltro(e.target.value)}
      aria-label="Filtrar por tipo"
     >
      <option value="todos">Todos</option>
      <option value="cliente">Clientes</option>
      <option value="empleado">Empleados</option>
     </select>
    </div>
    {err && <p className="p-note">No se pudieron leer los usuarios ({err}).</p>}
    {vista.length ? (
     vista.map(u => (
      <div key={u.id} className="p-row usr-row">
       <span>
        <b>{u.nombre}</b> <small>@{u.usuario}</small>
        <br />
        <small>
         {u.email} · {u.telefono} · 🎂 {fechaCorta(u.cumple)}
        </small>
       </span>
       <span style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
        <span className={'p-badge' + (u.rol === 'empleado' ? ' ok' : '')}>
         {ROL[u.rol] || u.rol}
        </span>
        {u.activo === false && <span className="p-badge bad">Inactivo</span>}
        <button className="btn alt" onClick={() => toggle(u)}>
         {u.activo === false ? 'Activar' : 'Desactivar'}
        </button>
       </span>
      </div>
     ))
    ) : (
     <p className="p-note">Aún no hay usuarios creados desde aquí.</p>
    )}
   </div>
  </div>
 )
}