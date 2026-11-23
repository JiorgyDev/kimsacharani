import { useState, useEffect, useRef } from 'react'
import { signOut } from 'firebase/auth'
import {
 addDoc,
 collection,
 onSnapshot,
 query,
 where,
 serverTimestamp,
} from 'firebase/firestore'
import { auth, db, FLOW } from './fb'
import { useSession, useStamps } from './useSession'
import RedeemBox from './Redeembox'
import Splash, { Rot, Roll, SD } from './Splash'
import heroMp4 from './assets/hero.mp4'
import heroPoster from './assets/hero-poster.jpg'
import clubMp4 from './assets/club.mp4'
import clubPoster from './assets/club-poster.jpg'
import LoginForm from './Login'
import {
 motion,
 AnimatePresence,
 MotionConfig,
 useScroll,
 useTransform,
 useReducedMotion,
} from 'framer-motion'
import { CATS, PROMOS, money } from './data'
import useMenu, { agotado } from './useMenu'

const COLORS = [
 '#9b2335',
 '#e3a72f',
 '#1f5a56',
 '#f1ead9',
 '#9b2335',
 '#e3a72f',
 '#1f5a56',
 '#f1ead9',
 '#9b2335',
 '#e3a72f',
]

const Weave = ({ sm }) => (
 <div className={'weave' + (sm ? ' sm' : '')} aria-hidden="true">
  {COLORS.map((c, i) => (
   <motion.i
    key={i}
    style={{ background: c }}
    initial={{ scaleY: 0 }}
    animate={{ scaleY: 1 }}
    transition={{ delay: SD + .4 + i * .07, duration: .5, ease: 'easeOut' }}
   />
  ))}
 </div>
)

const Rv = ({ children, x = 0, y = 40, d = 0 }) => (
 <motion.div
  initial={{ opacity: 0, x, y }}
  whileInView={{ opacity: 1, x: 0, y: 0 }}
  viewport={{ once: true, margin: '-80px' }}
  transition={{ duration: .8, delay: d, ease: [.2, .8, .2, 1] }}
 >
  {children}
 </motion.div>
)

function Photo({ label }) {
 const r = useRef(null),
  { scrollYProgress: p } = useScroll({
   target: r,
   offset: ['start end', 'end start'],
  }),
  y = useTransform(p, [0, 1], [70, -70]),
  rot = useTransform(p, [0, 1], [-4, 4])

 return (
  <motion.div ref={r} className="ph" style={{ y, rotate: rot }}>
   {label}
  </motion.div>
 )
}

function Marquee({ t }) {
 const { scrollY } = useScroll(),
  x = useTransform(scrollY, v => -v * .35)

 return (
  <div
   aria-hidden="true"
   style={{
    overflow: 'hidden',
    background: 'var(--gold)',
    padding: 'clamp(.75rem, 2vw, 1rem) 0',
   }}
  >
   <motion.div
    style={{
     x,
     whiteSpace: 'nowrap',
     fontFamily: "'DM Serif Display',serif",
     fontSize: 'clamp(1.6rem, 6vw, 4rem)',
     color: 'var(--coffee)',
    }}
   >
    {(t + ' · ').repeat(14)}
   </motion.div>
  </div>
 )
}

// Video de fondo: se pausa fuera de pantalla, y con "reducir movimiento" o ahorro de datos muestra solo la foto
function TikTok({ id }) {
 return (
  <div
   style={{
    width: '100%',
    maxWidth: 325,
    height: 'min(740px, 85vh)',
    margin: '0 auto',
    borderRadius: 16,
    overflow: 'hidden',
   }}
  >
   <iframe
    src={`https://www.tiktok.com/embed/v2/${id}`}
    title="TikTok de Kimsa Charani"
    loading="lazy"
    allow="encrypted-media; fullscreen"
    style={{ width: '100%', height: '100%', border: 0 }}
   />
  </div>
 )
}

function BgVideo({ src, poster, opacity = 1 }) {
 const ref = useRef(null),
  reduce = useReducedMotion(),
  [on, setOn] = useState(false)
 const lite =
  typeof navigator !== 'undefined' &&
  navigator.connection &&
  navigator.connection.saveData

 useEffect(() => {
  const v = ref.current
  if (!v || reduce || lite) return
  v.muted = true
  const io = new IntersectionObserver(([e]) => {
   e.isIntersecting ? v.play().catch(() => {}) : v.pause()
  })
  io.observe(v)
  return () => io.disconnect()
 }, [reduce, lite])

 const fill = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
 }

 return (
  <div
   aria-hidden="true"
   style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity }}
  >
   <img src={poster} alt="" style={fill} />
   {!reduce && !lite && (
    <video
     ref={ref}
     src={src}
     poster={poster}
     muted
     loop
     playsInline
     preload="auto"
     onPlaying={() => setOn(true)}
     style={{ ...fill, opacity: on ? 1 : 0, transition: 'opacity 1s' }}
    />
   )}
  </div>
 )
}

export default function App() {
 const [cat, setCat] = useState(CATS[0]),
  [cart, setCart] = useState({}),
  [open, setOpen] = useState(false),
  [ready, setReady] = useState(false),
  [navOpen, setNavOpen] = useState(false)
 const [login, setLogin] = useState(false),
  sess = useSession(),
  user = sess ? sess.name : null,
  nSellos = useStamps(sess && sess.uid),
  stamps = nSellos > 0 && nSellos % 5 === 0 ? 5 : nSellos % 5
 const [orders, setOrders] = useState([]),
  [toast, setToast] = useState('')
 const { list: MENU } = useMenu() // menú y stock en vivo desde Firestore (con respaldo en data.js)
 const { scrollY, scrollYProgress } = useScroll(),
  hy = useTransform(scrollY, [0, 400], [0, -70]),
  ho = useTransform(scrollY, [0, 350], [1, 0]),
  y = useTransform(scrollY, [0, 600], [0, 150])

 const say = m => {
  setToast(m)
  setTimeout(() => setToast(''), 2500)
 }

 useEffect(() => {
  if (!sess) {
   setOrders([])
   return
  }
  return onSnapshot(
   query(collection(db, 'orders'), where('uid', '==', sess.uid)),
   s =>
    setOrders(
     s.docs
      .map(d => d.data())
      .sort((a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0))
      .map(x => ({
       n: x.num,
       items: x.count,
       total: x.total,
       st: FLOW[x.st],
      }))
    )
  )
 }, [sess])

 const items = MENU.filter(p => cart[p.id]).map(p => ({ ...p, q: cart[p.id] }))
 const total = items.reduce((s, p) => s + p.q * p.price, 0),
  count = items.reduce((s, p) => s + p.q, 0)

 const add = p => {
  if (agotado(p)) return say(`${p.name} está agotado`)
  const hay = typeof p.stock === 'number' ? p.stock : Infinity
  if ((cart[p.id] || 0) >= hay) return say(`Solo quedan ${hay} de ${p.name}`)
  setCart(c => ({ ...c, [p.id]: (c[p.id] || 0) + 1 }))
  say(`${p.name} agregado`)
 }

 const dec = id =>
  setCart(c => {
   const n = { ...c, [id]: c[id] - 1 }
   if (!n[id]) delete n[id]
   return n
  })

 const send = async () => {
  if (!user) {
   setOpen(false)
   setLogin(true)
   return
  }
  const sin = items.find(
   p => agotado(p) || (typeof p.stock === 'number' && p.q > p.stock)
  )
  if (sin) return say(`No alcanza el stock de ${sin.name}. Ajusta tu pedido.`)
  try {
   await addDoc(collection(db, 'orders'), {
    uid: sess.uid,
    who: sess.name,
    items: items.map(p => ({ n: p.name, q: p.q, p: p.price, id: p.id })),
    count,
    total,
    st: 0,
    mod: 'Recoger',
    num: Math.floor(Math.random() * 9000) + 1000,
    ts: serverTimestamp(),
   })
   setCart({})
   setOpen(false)
   say('Pedido enviado')
  } catch (e) {
   say('No se pudo enviar el pedido')
  }
 }

 const words = 'Kimsa Charani Café'.split(' ')

 return (
  <MotionConfig reducedMotion="user">
   <style>{`
    .nav-links {
     display: contents;
    }
    .burger {
     display: none;
     background: transparent;
     border: 1px solid currentColor;
     color: inherit;
     border-radius: 8px;
     padding: .35rem .65rem;
     font-size: 1.25rem;
     line-height: 1;
     cursor: pointer;
    }
    @media (max-width: 768px) {
     nav .wrap {
      flex-wrap: wrap;
      gap: .5rem;
      justify-content: space-between;
      align-items: center;
     }
     .burger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
     }
     .nav-links {
      display: none;
      width: 100%;
      flex-direction: column;
      align-items: flex-start;
      gap: .75rem;
      padding: .75rem 0 .25rem;
      order: 10;
     }
     .nav-links.open {
      display: flex;
     }
     .nav-links a,
     .nav-links .btn {
      width: 100%;
      text-align: left;
     }
     .about {
      grid-template-columns: 1fr !important;
      gap: 2rem;
     }
     .grid {
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)) !important;
     }
     .tabs {
      overflow-x: auto;
      flex-wrap: nowrap;
      -webkit-overflow-scrolling: touch;
      padding-bottom: .5rem;
     }
     .promos {
      grid-template-columns: 1fr !important;
     }
     .stamps {
      gap: .5rem;
      flex-wrap: wrap;
      justify-content: center;
     }
     .drawer {
      width: 100% !important;
      max-width: 100vw !important;
     }
     .modal {
      width: min(92vw, 420px) !important;
     }
     .hero .row {
      flex-wrap: wrap;
      gap: .75rem;
     }
    }
    @media (max-width: 480px) {
     .hero h1 {
      font-size: clamp(2.2rem, 11vw, 3.2rem);
     }
     .line {
      flex-direction: column;
      align-items: flex-start;
      gap: .25rem;
     }
    }
   `}</style>

   <motion.div
    style={{
     scaleX: scrollYProgress,
     position: 'fixed',
     top: 0,
     left: 0,
     right: 0,
     height: 4,
     background: 'var(--gold)',
     transformOrigin: '0 50%',
     zIndex: 60,
    }}
   />

   <AnimatePresence>
    {!ready && <Splash onDone={() => setReady(true)} />}
   </AnimatePresence>

   <nav>
    <div className="wrap">
     <span className="logo">Kimsa Charani</span>
     <div className={'nav-links' + (navOpen ? ' open' : '')}>
      {[
       ['menu', 'Menú'],
       ['nosotros', 'Nosotros'],
       ['promos', 'Novedades'],
       ['club', 'Club'],
       ['contacto', 'Contacto'],
      ].map(([h, t]) => (
       <a key={h} href={'#' + h} onClick={() => setNavOpen(false)}>
        <Roll t={t} />
       </a>
      ))}
      {sess && sess.role !== 'Cliente' && (
       <a href="#/panel" onClick={() => setNavOpen(false)}>
        Mi panel
       </a>
      )}
      <button
       className="btn alt"
       onClick={() => {
        setNavOpen(false)
        user ? signOut(auth) : setLogin(true)
       }}
      >
       {user ? `Hola, ${user} · Salir` : 'Ingresar'}
      </button>
     </div>
     <button
      className="btn"
      onClick={() => setOpen(true)}
      aria-label="Abrir carrito"
     >
      Carrito ({count})
     </button>
     <button
      className="burger"
      onClick={() => setNavOpen(o => !o)}
      aria-label="Abrir menú"
      aria-expanded={navOpen}
     >
      {navOpen ? '✕' : '☰'}
     </button>
    </div>
   </nav>

   <header
    className="hero"
    style={{
     minHeight: '92vh',
     display: 'flex',
     flexDirection: 'column',
     padding: 'clamp(5rem, 12vh, 6rem) 0 0',
     position: 'relative',
     overflow: 'hidden',
    }}
   >
    <BgVideo src={heroMp4} poster={heroPoster} />
    <div
     aria-hidden="true"
     style={{
      position: 'absolute',
      inset: 0,
      background:
       'linear-gradient(180deg,rgba(26,14,9,.6) 0%,rgba(26,14,9,.35) 45%,rgba(26,14,9,.92) 100%)',
     }}
    />
    <motion.div className="glow" style={{ y }} />
    <motion.div
     className="wrap"
     style={{
      y: hy,
      opacity: ho,
      width: '100%',
      marginTop: 'auto',
      marginBottom: 'auto',
      position: 'relative',
     }}
    >
     <h1>
      {words.map((w, i) => (
       <span key={i}>
        <motion.span
         initial={{ y: '110%' }}
         animate={{ y: 0 }}
         transition={{
          delay: SD + .15 + i * .18,
          duration: .8,
          ease: [.2, .8, .2, 1],
         }}
        >
         {w}
        </motion.span>
       </span>
      ))}
     </h1>
     <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: SD + .9 }}
     >
      <Rot />
     </motion.div>
     <motion.div
      className="row"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: SD + 1.1 }}
     >
      <a href="#menu">
       <button className="btn">Explorar menú</button>
      </a>
      <a href="#club">
       <button className="btn alt">Únete al Club</button>
      </a>
     </motion.div>
     <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: .7, y: [0, 8, 0] }}
      transition={{
       opacity: { delay: SD + 1.4 },
       y: { delay: SD + 1.4, duration: 1.6, repeat: Infinity },
      }}
      style={{ marginTop: '2.5rem', fontSize: '.9rem' }}
     >
      ↓ Desliza
     </motion.p>
    </motion.div>
    <div style={{ marginTop: '2rem' }}>
     <Weave />
    </div>
   </header>

   <Marquee t="Café · Pan · Club Kimsa Charani" />

   <section id="nosotros">
    <div className="wrap about">
     <Rv x={-60} y={0}>
      <h2>Nuestra historia</h2>
      {/* <p>Aquí va la historia real de Kimsa Charani. <b>Texto provisional.</b></p> */}
     </Rv>
     <TikTok id="7678176989244706066" />
    </div>
   </section>

   <section id="menu" style={{ background: '#2a17100a' }}>
    <div className="wrap">
     <Rv>
      <h2>Menú</h2>
     </Rv>
     <div className="tabs" role="tablist">
      {CATS.map(c => (
       <button
        key={c}
        role="tab"
        aria-selected={c === cat}
        className={'tab' + (c === cat ? ' on' : '')}
        onClick={() => setCat(c)}
       >
        {c === cat && <motion.span layoutId="pill" className="pill" />}
        {c}
       </button>
      ))}
     </div>
     <motion.div className="grid" layout>
      <AnimatePresence mode="popLayout">
       {MENU.filter(p => p.cat === cat).map(p => (
        <motion.article
         key={p.id}
         layout
         className="card"
         initial={{ opacity: 0, scale: .9, y: 40 }}
         whileInView={{ opacity: 1, scale: 1, y: 0 }}
         viewport={{ once: true, margin: '-40px' }}
         exit={{ opacity: 0, scale: .9 }}
         whileHover={{ y: -6 }}
        >
         {p.top && <span className="tag">Destacado</span>}
         {agotado(p) && <span className="tag out">Agotado</span>}
         <div className="pic">{p.emoji}</div>
         <div className="in">
          <h3>{p.name}</h3>
          <p>
           {p.desc}
           {typeof p.stock === 'number' &&
            p.stock > 0 &&
            p.stock <= 5 && <small> · Quedan {p.stock}</small>}
          </p>
          <div className="f">
           <b>{money(p.price)}</b>
           <motion.button
            whileTap={{ scale: .9 }}
            className="btn red"
            disabled={agotado(p)}
            style={agotado(p) ? { opacity: .4 } : null}
            onClick={() => add(p)}
           >
            Agregar
           </motion.button>
          </div>
         </div>
        </motion.article>
       ))}
      </AnimatePresence>
     </motion.div>
     <p className="note" style={{ marginTop: '1rem' }}>
      Precios y fotos provisionales.
     </p>
    </div>
   </section>

   <Marquee t="Novedades · Promociones · Sellos" />

   <section id="promos">
    <div className="wrap">
     <Rv>
      <h2>Promociones y novedades</h2>
     </Rv>
     <div className="promos">
      {PROMOS.map((p, i) => (
       <motion.div
        key={p.t}
        className="promo"
        initial={{ opacity: 0, x: i % 2 ? 80 : -80 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: .7, delay: i * .12 }}
        whileHover={{ x: 6 }}
       >
        <h3>{p.t}</h3>
        <p>{p.d}</p>
       </motion.div>
      ))}
     </div>
    </div>
   </section>

   <section
    id="club"
    className="club"
    style={{ position: 'relative', overflow: 'hidden' }}
   >
    <BgVideo src={clubMp4} poster={clubPoster} opacity={.3} />
    <div className="wrap" style={{ position: 'relative' }}>
     <Rv>
      <h2>Club Kimsa Charani</h2>
     </Rv>
     <Rv>
      <p style={{ maxWidth: '36rem' }}>
       Junta 5 sellos y tu próximo café va gratis.
      </p>
     </Rv>
     <motion.div
      className="stamps"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: .7 }}
     >
      {[0, 1, 2, 3, 4].map(i => (
       <motion.div
        key={i}
        className={'stamp' + (i < stamps ? ' on' : '')}
        animate={
         i < stamps
          ? { scale: [1, 1.35, 1], rotate: [0, -12, 0] }
          : { scale: 1 }
        }
        transition={{ type: 'spring', stiffness: 300, damping: 12 }}
       >
        {i < stamps ? '☕' : ''}
       </motion.div>
      ))}
     </motion.div>
     {user ? (
      <p>
       Hola, {user}. Llevas {stamps} de 5 sellos.
      </p>
     ) : (
      <p>Ingresa para ver tu progreso.</p>
     )}
     <div
      className="row"
      style={{
       display: 'flex',
       gap: '1rem',
       flexWrap: 'wrap',
       marginTop: '1rem',
      }}
     >
      {!user && (
       <button className="btn" onClick={() => setLogin(true)}>
        Únete al Club Kimsa Charani
       </button>
      )}
      {user && <RedeemBox say={say} />}
      {user && stamps >= 5 && (
       <p>
        <b>¡Tienes un café gratis!</b> Pídelo en caja: el canje lo valida el
        personal.
       </p>
      )}
     </div>
     <p className="note" style={{ marginTop: '1rem' }}>
      El sello se acredita con el código o QR que te da el personal. Vale 10
      minutos y se usa una sola vez.
     </p>
     {user && (
      <div style={{ marginTop: '2rem' }}>
       <h3 style={{ color: 'var(--bone)' }}>Mis pedidos</h3>
       {orders.length ? (
        orders.map(o => (
         <div key={o.n} className="line">
          <span>
           Pedido #{o.n} · {o.items} productos
          </span>
          <span>
           {money(o.total)} · {o.st}
          </span>
         </div>
        ))
       ) : (
        <p className="note">Aún no tienes pedidos. Agrega algo del menú.</p>
       )}
      </div>
     )}
    </div>
   </section>

   <section id="contacto">
    <div className="wrap about">
     <div>
      <Rv>
       <h2>Ubicación y contacto</h2>
      </Rv>
      <p>
       📍Calle Panamá esquina Cuba Miraflores
       <br />
       ⏰ Abrimos de 15:00 a 21:00
       <br />
       WhatsApp: +591 74269004
       <br />
       Instagram: @kimsa_charani_cafe
      </p>
     </div>
     <Rv x={60} y={0}>
      <div
       style={{
        borderRadius: 16,
        overflow: 'hidden',
        border: '2px solid var(--gold)',
       }}
      >
       <iframe
        title="Ubicación de Kimsa Charani Café"
        src="https://www.google.com/maps?q=-16.4968158,-68.1204286&z=17&output=embed"
        width="100%"
        height="320"
        style={{ border: 0, display: 'block', minHeight: 240 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
       />
      </div>
      <a
       className="btn alt"
       href="https://www.google.com/maps/dir/?api=1&destination=-16.4968158,-68.1204286"
       target="_blank"
       rel="noopener noreferrer"
       style={{ display: 'inline-block', marginTop: '1rem' }}
      >
       Cómo llegar
      </a>
     </Rv>
    </div>
   </section>

   <Weave sm />
   <footer>© Kimsa Charani Café <br /> JiorgyDev </footer>

   <AnimatePresence>
    {open && (
     <>
      <motion.div
       className="veil"
       initial={{ opacity: 0 }}
       animate={{ opacity: 1 }}
       exit={{ opacity: 0 }}
       onClick={() => setOpen(false)}
      />
      <motion.aside
       className="drawer"
       initial={{ x: '100%' }}
       animate={{ x: 0 }}
       exit={{ x: '100%' }}
       transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      >
       <h3>Tu pedido</h3>
       {items.length ? (
        items.map(p => (
         <div key={p.id} className="line">
          <span>
           {p.q} × {p.name}
          </span>
          <span>
           {money(p.q * p.price)}{' '}
           <button onClick={() => dec(p.id)} aria-label="Quitar uno">
            −
           </button>
          </span>
         </div>
        ))
       ) : (
        <p>Tu carrito está vacío. Elige algo del menú.</p>
       )}
       {items.length > 0 && (
        <>
         <b>Total: {money(total)}</b>
         <button className="btn red" onClick={send}>
          {user ? 'Enviar pedido (demo)' : 'Ingresar para pedir'}
         </button>
        </>
       )}
       <button className="btn" onClick={() => setOpen(false)}>
        Seguir viendo el menú
       </button>
      </motion.aside>
     </>
    )}

    {login && (
     <>
      <motion.div
       className="veil"
       initial={{ opacity: 0 }}
       animate={{ opacity: 1 }}
       exit={{ opacity: 0 }}
       onClick={() => setLogin(false)}
      />
      <motion.div
       className="modal"
       initial={{ opacity: 0, y: '-45%', x: '-50%' }}
       animate={{ opacity: 1, y: '-50%', x: '-50%' }}
       exit={{ opacity: 0, y: '-45%', x: '-50%' }}
      >
       <LoginForm
        onDone={r => {
         setLogin(false)
         say('Sesión iniciada')
         if (r !== 'Cliente') location.hash = '#/panel'
        }}
       />
      </motion.div>
     </>
    )}

    {toast && (
     <motion.div
      className="toast"
      initial={{ opacity: 0, y: 20, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: 20, x: '-50%' }}
     >
      {toast}
     </motion.div>
    )}
   </AnimatePresence>
  </MotionConfig>
 )
}