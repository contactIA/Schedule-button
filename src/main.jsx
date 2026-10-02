import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Geist, a letra do CRM, vem no pacote do app: nenhum pedido a outro servidor
// ao abrir o iframe.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import App from './App.jsx'
import Setup from './pages/Setup.jsx'

const path = window.location.pathname

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {path === '/setup' ? <Setup /> : <App />}
  </StrictMode>,
)
