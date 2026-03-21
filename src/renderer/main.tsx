import './lib/monacoSetup'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/global.css'

// Catch unhandled errors to prevent blank screens
window.addEventListener('error', (e) => {
  console.error('Unhandled error:', e.error)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason)
})

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
