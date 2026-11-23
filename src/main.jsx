import { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Panels from './Panels'
import './styles.css'

function Root() {
 const [h, setH] = useState(location.hash)

 useEffect(() => {
  const f = () => setH(location.hash)
  addEventListener('hashchange', f)
  return () => removeEventListener('hashchange', f)
 }, [])

 return h.startsWith('#/panel') ? <Panels /> : <App />
}

createRoot(document.getElementById('root')).render(<Root />)