import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
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
    <App />
  </React.StrictMode>
)
