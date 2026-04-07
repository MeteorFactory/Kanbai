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

const params = new URLSearchParams(window.location.search)
const isExternalWindow = params.get('mode') === 'external'

const root = document.getElementById('root')
if (root) {
  if (isExternalWindow) {
    // Lazy-load external window app to avoid bundling it with the main app
    import('./features/external-window/external-window-app').then(({ ExternalWindowApp }) => {
      createRoot(root).render(
        <React.StrictMode>
          <ExternalWindowApp />
        </React.StrictMode>,
      )
    })
  } else {
    createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  }
}
