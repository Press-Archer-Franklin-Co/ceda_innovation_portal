import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import I18nProvider from './i18n/I18nProvider'
import ToastProvider from './components/ui/ToastProvider'
import ConfirmProvider from './components/ui/ConfirmProvider'
import BrandLoader from './components/ui/BrandLoader'
import { boot } from './lib/boot'
import './index.css'

// The static bulb inside #root (index.html) shows until React draws BrandLoader in the same place (U12).
const root = document.getElementById('root')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <App />
          <BrandLoader boot={boot} />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  </React.StrictMode>
)
