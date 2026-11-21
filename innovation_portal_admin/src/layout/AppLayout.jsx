import React, { useState, useEffect, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar  from './Topbar'
import DemoLoginsBanner from './DemoLoginsBanner'
import { LayoutContext } from './LayoutContext'
import PageSkeleton from '../components/ui/PageSkeleton'
import PageErrorBoundary from '../components/ui/PageErrorBoundary'

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen]             = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const checkWidth = () => {
      if (window.innerWidth < 1024) setSidebarOpen(false)
      else setSidebarOpen(true)
    }
    checkWidth()
    window.addEventListener('resize', checkWidth)
    return () => window.removeEventListener('resize', checkWidth)
  }, [])

  return (
    <LayoutContext.Provider value={{ sidebarOpen, setSidebarOpen, mobileSidebarOpen, setMobileSidebarOpen }}>
      <div className="flex h-screen bg-bg overflow-hidden">

        <Sidebar />

        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-scrim/45 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        <div
          className="flex-1 min-w-0 flex flex-col overflow-hidden transition-all duration-200"
          style={{ marginLeft: sidebarOpen ? 'var(--sidebar-width)' : '0' }}
        >
          <Topbar />
          <DemoLoginsBanner />
          {location.pathname.startsWith('/evaluate/') ? (
            <main className="flex-1 overflow-hidden min-h-0">
              <div className="h-full w-full overflow-hidden">
                <PageErrorBoundary resetKey={location.pathname}>
                  <Suspense fallback={<PageSkeleton />}>
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
