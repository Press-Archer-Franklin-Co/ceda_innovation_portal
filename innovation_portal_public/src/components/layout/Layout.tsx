import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'
import MobileTabBar from './MobileTabBar'
import { useT } from '../../i18n'

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
        <Outlet />
      </main>
      <Footer />
      <MobileTabBar />
    </div>
  )
}
