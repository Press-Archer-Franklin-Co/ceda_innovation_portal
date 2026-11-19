import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import I18nProvider from './i18n/I18nProvider'
import ToastProvider from './components/ui/ToastProvider'
import ConfirmProvider from './components/ui/ConfirmProvider'
import './index.css'

const overlay = document.getElementById('ceda-loading')
const root = document.getElementById('root')
if (overlay) {
  const observer = new MutationObserver(() => {
    if (root.children.length > 0) {
      overlay.style.display = 'none'
      observer.disconnect()
    }
  })
  observer.observe(root, { childList: true })
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  </React.StrictMode>
)
