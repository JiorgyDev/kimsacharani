import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const cfg = {
 apiKey: import.meta.env.VITE_FB_API_KEY,
 authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
 projectId: import.meta.env.VITE_FB_PROJECT_ID,
 storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
 messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
 appId: import.meta.env.VITE_FB_APP_ID,
}

const app = initializeApp(cfg)
export const auth = getAuth(app),
 db = getFirestore(app)

// Segunda instancia SOLO para crear cuentas: así el propietario no pierde su sesión al crear un usuario.
export const createAuth = getAuth(initializeApp(cfg, 'creator'))

export const FLOW = ['Pendiente', 'Aceptado', 'En preparación', 'Listo', 'Entregado']

// Correos "semilla": siempre tienen su rol aunque no tengan documento en la colección users.
// Los demás usuarios toman el rol desde Firestore (users/{uid}.rol).
const STAFF = {
 'bbb@kimsa.test': 'Empleado',
 'ccc@kimsa.test': 'Propietario',
}

export const roleOf = e => STAFF[(e || '').toLowerCase()] || 'Cliente'

export const ROL = {
 propietario: 'Propietario',
 empleado: 'Empleado',
 cliente: 'Cliente',
}