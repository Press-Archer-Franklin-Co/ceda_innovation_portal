import React, { useState, useEffect, useRef, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar  from './Topbar'
import DemoLoginsBanner from './DemoLoginsBanner'
import { LayoutContext } from './LayoutContext'
import PageSkeleton from '../components/ui/PageSkeleton'
import PageErrorBoundary from '../components/ui/PageErrorBoundary'
import { BootStep } from '../components/ui/BrandLoader'
import { boot } from '../lib/boot'
import { useMediaQuery } from '../lib/useMediaQuery'
import { MENU } from '../lib/motion/brand'

// The staff shell. Desktop: the menu is open or a 72px icon rail, remembered on this device (U12). Phone: the
// menu is a drawer over the page. The menu moves the content's left edge itself while it animates
// (--sidebar-current on the shell), so the two never drift apart.

function readOpen() {
  try {
    return localStorage.getItem(MENU.storageKey) !== '0'
  } catch {
    return true
  }
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpenState]        = useState(readOpen)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const phone = !useMediaQuery('(min-width: 1024px)')
  const shellRef = useRef(null)
  const location = useLocation()

  const setSidebarOpen = (next) => {
    setSidebarOpenState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      try {
        localStorage.setItem(MENU.storageKey, value ? '1' : '0')
      } catch {
        /* private mode: remembered for this visit only */
      }
      return value
    })
  }

  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [location.pathname])

  const restLeft = phone ? '0px' : sidebarOpen ? 'var(--sidebar-width)' : 'var(--sidebar-rail)'

  return (
    <LayoutContext.Provider value={{ sidebarOpen, setSidebarOpen, mobileSidebarOpen, setMobileSidebarOpen, phone, shellRef }}>
      <div ref={shellRef} className="flex h-screen bg-bg overflow-hidden" style={{ '--sidebar-current': restLeft }}>

        <Sidebar />

        <div
          className="flex-1 min-w-0 flex flex-col overflow-hidden"
          style={{ marginLeft: 'var(--sidebar-current)' }}
        >
          <Topbar />
          <DemoLoginsBanner />
          {location.pathname.startsWith('/evaluate/') ? (
            <main className="flex-1 overflow-hidden min-h-0">
              <div className="h-full w-full overflow-hidden">
                <PageErrorBoundary resetKey={location.pathname}>
                  <Suspense fallback={<PageSkeleton />}>
                    <BootStep boot={boot} />
                    <Outlet />
                  </Suspense>
                </PageErrorBoundary>
              </div>
            </main>
          ) : (
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
              <div className="p-[14px] sm:p-4 2xl:p-[22px] min-w-0 w-full">
                <PageErrorBoundary resetKey={location.pathname}>
                  <Suspense fallback={<PageSkeleton />}>
                    <BootStep boot={boot} />
                    <Outlet />
                  </Suspense>
                </PageErrorBoundary>
              </div>
            </main>
          )}
        </div>
      </div>
    </LayoutContext.Provider>
  )
}
