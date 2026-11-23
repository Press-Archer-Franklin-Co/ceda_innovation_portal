import { Outlet, useLocation } from 'react-router-dom'
import { Suspense } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'
import MobileTabBar from './MobileTabBar'
import NeedHelp from '../guide/NeedHelp'
import { useT } from '../../i18n'
import PageSkeleton from '../ui/PageSkeleton'
import PageErrorBoundary from '../ui/PageErrorBoundary'
import { BootStep } from '../ui/BrandLoader'
import { boot } from '../../lib/boot'
import { useScrollKeeper } from '../../lib/scrollKeeper'

/** Public shell: utility bar + nav, page, footer; on phone a sticky tab bar. Page background is always bg (white). */
export default function Layout() {
  const { pathname } = useLocation()
  const t = useT()

  // A new page starts at the top; Back and Forward return to where the person was.
  useScrollKeeper()

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
            <BootStep boot={boot} />
            <Outlet />
          </Suspense>
        </PageErrorBoundary>
      </main>
      <Footer />
      <MobileTabBar />
      {/* 2.14: one Need help? button: the guide, or the live chat bubble (C1) when the guide is off. */}
      <NeedHelp />
    </div>
  )
}
