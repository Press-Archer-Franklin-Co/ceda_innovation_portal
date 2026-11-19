import { NavLink } from 'react-router-dom'
import { Home, LayoutDashboard, Megaphone, Plus, Trophy, User } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import { SUBMIT_PATH } from './Navbar'

// Figma 1 · Public home › Tab bar (sticky) (10:1350). Phone only. The + in the centre always opens Submit an idea.

export const TAB_BAR_SPACE = 'pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0'

export default function MobileTabBar() {
  const { t } = useI18n()
  const { isAuthenticated } = useAuth()

  const tab = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex flex-col items-center gap-1 w-[62px] py-1 text-d-label-s font-body rounded-control',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      isActive ? 'text-primary' : 'text-muted',
    )

  return (
    <nav
      aria-label={t('tabs.label')}
      className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-bg border-t border-border px-3 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] flex items-center justify-between"
    >
      <NavLink to="/" end className={tab}>
        <Home size={22} aria-hidden />
        {t('nav.home')}
      </NavLink>
      <NavLink to="/challenges" className={tab}>
        <Trophy size={22} aria-hidden />
        {t('nav.challenges')}
      </NavLink>
      <NavLink
        to={SUBMIT_PATH}
        aria-label={t('nav.submit')}
        className="w-[52px] h-[52px] -mt-1 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-[0_10px_15px_rgba(46,26,15,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Plus size={24} strokeWidth={2.25} aria-hidden />
      </NavLink>
      <NavLink to="/news" className={tab}>
        <Megaphone size={22} aria-hidden />
        {t('tabs.news')}
      </NavLink>
      {isAuthenticated ? (
        <NavLink to="/dashboard" className={tab}>
          <LayoutDashboard size={22} aria-hidden />
          {t('nav.myIdeas')}
        </NavLink>
      ) : (
        <NavLink to="/login" className={tab}>
          <User size={22} aria-hidden />
          {t('common.signIn')}
        </NavLink>
      )}
    </nav>
  )
}
