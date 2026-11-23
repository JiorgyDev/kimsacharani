import { useState, useEffect } from 'react'
import {
 motion,
 AnimatePresence,
 animate,
 useScroll,
 useTransform,
} from 'framer-motion'
import logo from './assets/logo.jpg'

export const SD = 3 // duración del splash en segundos

// chispas doradas que suben (posiciones fijas, sin azar)
const SPARKS = Array.from({ length: 24 }, (_, i) => ({
 l: (i * 37 + 11) % 100,
 s: 2 + (i % 3) * 1.6,
 d: (i * .21) % 2.4,
 t: 3 + (i % 4) * .7,
}))

export default function Splash({ onDone }) {
 const [n, setN] = useState(0)

 useEffect(() => {
  document.body.style.overflow = 'hidden'
  const c = animate(0, 100, {
   duration: SD - .4,
   ease: 'easeInOut',
   onUpdate: v => setN(Math.round(v)),
  }),
   t = setTimeout(onDone, SD * 1000)

  return () => {
   c.stop()
   clearTimeout(t)
   document.body.style.overflow = ''
  }
 }, [])

 return (
  <motion.div
   exit={{ y: '-100%', transition: { duration: .9, ease: [.8, 0, .2, 1] } }}
   style={{
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    overflow: 'hidden',
    background:
     'radial-gradient(circle at 50% 45%,#3b2216 0%,#2a1710 55%,#1a0e09 100%)',
    color: '#f1ead9',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
   }}
  >
   {SPARKS.map((p, i) => (
    <motion.span
     key={i}
     aria-hidden="true"
     style={{
      position: 'absolute',
      bottom: -12,
      left: p.l + '%',
      width: p.s,
      height: p.s,
      borderRadius: '50%',
      background: '#e3a72f',
      boxShadow: '0 0 8px #e3a72f',
     }}
     initial={{ y: 0, opacity: 0 }}
     animate={{ y: '-105vh', opacity: [0, .9, .9, 0] }}
     transition={{
      duration: p.t + 1.5,
      delay: p.d,
      repeat: Infinity,
      ease: 'easeOut',
     }}
    />
   ))}

   <div
    style={{
     position: 'relative',
     width: 'min(62vw,300px)',
     aspectRatio: '1',
    }}
   >
    <motion.div
     aria-hidden="true"
     style={{ position: 'absolute', inset: 0, borderRadius: '50%' }}
     initial={{ opacity: 0, boxShadow: '0 0 0 0 rgba(227,167,47,0)' }}
     animate={{
      opacity: 1,
      boxShadow: [
       '0 0 0 0 rgba(227,167,47,0)',
       '0 0 70px 10px rgba(227,167,47,.45)',
       '0 0 35px 4px rgba(227,167,47,.25)',
      ],
     }}
     transition={{ duration: 2.2, delay: .4 }}
    />
    <motion.img
     src={logo}
     alt="Kimsa Charani Coffee Shop"
     style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      display: 'block',
     }}
     initial={{ opacity: 0, scale: .7, filter: 'blur(14px)' }}
     animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
     transition={{ duration: 1.1, delay: .25, ease: [.2, .8, .2, 1] }}
    />
    <svg
     viewBox="0 0 100 100"
     aria-hidden="true"
     style={{
      position: 'absolute',
      inset: '-5%',
      width: '110%',
      height: '110%',
      transform: 'rotate(-90deg)',
     }}
    >
     <motion.circle
      cx="50"
      cy="50"
      r="49"
      fill="none"
      stroke="#e3a72f"
      strokeWidth=".7"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 1.6, delay: .3, ease: 'easeInOut' }}
     />
    </svg>
   </div>

   <motion.p
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 1.5, duration: .6 }}
    style={{
     marginTop: '2rem',
     letterSpacing: '.35em',
     fontSize: '.8rem',
     color: '#e3a72f',
     textTransform: 'uppercase',
    }}
   >
    Café · Pan · Club
   </motion.p>

   <div
    style={{
     position: 'absolute',
     left: '1.5rem',
     bottom: '.5rem',
     fontFamily: "'DM Serif Display',serif",
     fontSize: 'clamp(3rem,12vw,7rem)',
     color: '#e3a72f',
     lineHeight: 1,
    }}
   >
    {n}%
   </div>

   <button
    onClick={onDone}
    style={{
     position: 'absolute',
     right: '1.5rem',
     bottom: '1.5rem',
     background: 'transparent',
     color: '#f1ead9',
     border: '1px solid #f1ead966',
     borderRadius: 99,
     padding: '.45rem 1rem',
     cursor: 'pointer',
     font: 'inherit',
     fontSize: '.85rem',
    }}
   >
    Saltar
   </button>
  </motion.div>
 )
}

const B = [
 [6, 14, 26],
 [84, 12, 40],
 [18, 66, 34],
 [74, 58, 22],
 [48, 6, 18],
 [92, 78, 30],
 [4, 42, 20],
 [58, 82, 16],
]

function Bean({ l, t, s, i, sy }) {
 const y = useTransform(sy, v => -v * (.08 + i * .04))

 return (
  <motion.svg
   viewBox="0 0 20 28"
   width={s}
   style={{ position: 'absolute', left: l + '%', top: t + '%', y }}
   animate={{ rotate: [0, 18, -12, 0] }}
   transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut' }}
  >
   <ellipse cx="10" cy="14" rx="8" ry="12" fill="#6b3f26" />
   <path d="M10 3 q-6 11 0 22" stroke="#2a1710" strokeWidth="2" fill="none" />
  </motion.svg>
 )
}

export function Beans() {
 const { scrollY } = useScroll()

 return (
  <div
   aria-hidden="true"
   style={{
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    opacity: .85,
   }}
  >
   {B.map(([l, t, s], i) => (
    <Bean key={i} l={l} t={t} s={s} i={i} sy={scrollY} />
   ))}
  </div>
 )
}

export function Rot() {
 const W = ['Café', 'Pan', 'Club', 'Calidez'],
  [i, setI] = useState(0)

 useEffect(() => {
  const t = setInterval(() => setI(x => (x + 1) % W.length), 2000)
  return () => clearInterval(t)
 }, [])

 return (
  <div
   style={{
    height: '1.3em',
    overflow: 'hidden',
    fontFamily: "'DM Serif Display',serif",
    fontSize: 'clamp(1.6rem,4vw,2.6rem)',
    color: '#e3a72f',
    margin: '1rem 0',
   }}
  >
   <AnimatePresence mode="wait">
    <motion.div
     key={i}
     initial={{ y: '100%' }}
     animate={{ y: 0 }}
     exit={{ y: '-100%' }}
     transition={{ duration: .4 }}
    >
     {W[i]}.
    </motion.div>
   </AnimatePresence>
  </div>
 )
}

export const Roll = ({ t }) => (
 <motion.span
  initial="i"
  whileHover="h"
  style={{
   display: 'inline-block',
   overflow: 'hidden',
   height: '1.4em',
   lineHeight: '1.4em',
   verticalAlign: 'bottom',
  }}
 >
  <motion.span
   variants={{ i: { y: 0 }, h: { y: '-1.4em' } }}
   transition={{ duration: .35, ease: [.2, .8, .2, 1] }}
   style={{ display: 'block' }}
  >
   <span style={{ display: 'block' }}>{t}</span>
   <span style={{ display: 'block', color: '#e3a72f' }}>{t}</span>
  </motion.span>
 </motion.span>
)