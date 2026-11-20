import { Outlet, useLocation } from 'react-router-dom'
import { Suspense, useEffect } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'
import MobileTabBar from './MobileTabBar'
import { useT } from '../../i18n'
import PageSkeleton from '../ui/PageSkeleton'
import PageErrorBoundary from '../ui/PageErrorBoundary'

/** Public shell: utility bar + nav, page, footer; on phone a sticky tab bar. Page background is always bg (white). */
export default function Layout() {
  const { pathname } = useLocation()
  const t = useT()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex flex-col min-h-screen bg-bg text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:px-4 focus:py-2 focus:rounded-control focus:bg-primary focus:text-on-primary"
      >
        {t('common.skip')}
      </a>
      <Navbar />
      <main id="main" className="flex-1" tabIndex={-1}>
        {/* A page that fails shows an error with Retry inside the shell; header and footer stay. */}
        <PageErrorBoundary resetKey={pathname}>
          <Suspense fallback={<div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10"><PageSkeleton /></div>}>
            <Outlet />
          </Suspense>
        </PageErrorBoundary>
      </main>
      <Footer />
      <MobileTabBar />
    </div>
  )
}
