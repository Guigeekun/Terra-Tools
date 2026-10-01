import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '@datadog/browser-rum-react'
import App from './App.jsx'
import ErrorFallback from './components/shared/ErrorFallback.jsx'
import './rum.js'
import './App.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fallback={ErrorFallback}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
