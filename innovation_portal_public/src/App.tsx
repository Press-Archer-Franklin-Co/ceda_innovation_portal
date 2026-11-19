import { lazy, Suspense } from 'react'
import { Navigate, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout        from './components/layout/Layout'
import PrivateRoute  from './components/ui/PrivateRoute'
import Home          from './pages/Home'
import NotFound      from './pages/NotFound'
import About         from './pages/About'
import Guidelines    from './pages/Guidelines'
import FAQ           from './pages/FAQ'
import Challenges    from './pages/Challenges'
import Suggestions   from './pages/Suggestions'
import Innovate      from './pages/Innovate'
import Skills        from './pages/Skills'
import Login           from './pages/Login'
import SignUp          from './pages/SignUp'
import ForgotPassword  from './pages/ForgotPassword'
import ResetPassword   from './pages/ResetPassword'
import VerifyEmail     from './pages/VerifyEmail'
import MfaChallenge    from './pages/MfaChallenge'
import AuthCallback    from './pages/AuthCallback'
import Profile         from './pages/Profile'
import Security        from './pages/Security'
import TermsOfAgreement from './pages/TermsOfAgreement'
import PrivacyPolicy    from './pages/PrivacyPolicy'
import TermsOfUse       from './pages/TermsOfUse'
import News               from './pages/News'
import ArticleDetail      from './pages/ArticleDetail'
import HackathonDetail    from './pages/HackathonDetail'
import SubmissionDetail   from './pages/SubmissionDetail'
import DocumentPage       from './pages/DocumentPage'
import SpecialistInvite  from './pages/SpecialistInvite'
import JudgeInvite       from './pages/JudgeInvite'
import { I18nProvider } from './i18n'
import { ToastProvider } from './components/ui/Toast'

// U3 innovator screens (lazy; ceda-routing).
const CodeSignIn     = lazy(() => import('./pages/innovator/CodeSignIn'))
const InnovatorHome  = lazy(() => import('./pages/innovator/InnovatorHome'))
const MyIdeas        = lazy(() => import('./pages/innovator/MyIdeas'))
const TrackIdea      = lazy(() => import('./pages/innovator/TrackIdea'))
const IdeaForm       = lazy(() => import('./pages/innovator/IdeaForm'))
const Notifications  = lazy(() => import('./pages/innovator/Notifications'))

// Dev-only component gallery; not part of the production bundle.
const Styleguide = import.meta.env.DEV ? lazy(() => import('./pages/Styleguide')) : null

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'

  if (isLoading) return null
  if (isAuthenticated) return <Navigate to={from} replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login"           element={<PublicOnlyRoute><Login          /></PublicOnlyRoute>} />
      <Route path="/signup"          element={<PublicOnlyRoute><SignUp         /></PublicOnlyRoute>} />
      <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
      <Route path="/reset-password"  element={<PublicOnlyRoute><ResetPassword  /></PublicOnlyRoute>} />

      <Route path="/verify-email"    element={<VerifyEmail />} />
      <Route path="/mfa"            element={<MfaChallenge />} />

      <Route path="/auth/callback"   element={<AuthCallback />} />

      <Route path="/specialist-invite/:token" element={<SpecialistInvite />} />
      <Route path="/judge-invite/:token" element={<JudgeInvite />} />


      <Route element={<Layout />}>
        <Route path="/"            element={<Home />} />
        <Route path="/about"       element={<About />} />
        <Route path="/guidelines"  element={<Guidelines />} />
        <Route path="/faq"         element={<FAQ />} />
        <Route path="/challenges"  element={<Challenges />} />
        <Route path="/suggestions" element={<Suggestions />} />
        <Route path="/innovate"    element={<Innovate />} />
        <Route path="/skills"      element={<Skills />} />
        <Route path="/news"        element={<News />} />
        {/* TODO(U2): own Stories page; until then the news feed. */}
        <Route path="/stories"     element={<News />} />
        <Route path="/news/:id"    element={<ArticleDetail />} />
        <Route path="/hackathons/:id" element={<HackathonDetail />} />

        <Route path="/sign-in"     element={<PublicOnlyRoute><Suspense fallback={null}><CodeSignIn /></Suspense></PublicOnlyRoute>} />

        <Route path="/terms-of-agreement" element={<TermsOfAgreement />} />
        <Route path="/privacy-policy"     element={<PrivacyPolicy />} />
        <Route path="/terms-of-use"       element={<TermsOfUse />} />

        <Route element={<PrivateRoute />}>
          <Route path="/dashboard"          element={<Suspense fallback={null}><InnovatorHome /></Suspense>} />
          <Route path="/my-ideas"           element={<Suspense fallback={null}><MyIdeas /></Suspense>} />
          <Route path="/my-ideas/draft/:id" element={<Suspense fallback={null}><IdeaForm /></Suspense>} />
          <Route path="/my-ideas/:id"       element={<Suspense fallback={null}><TrackIdea /></Suspense>} />
          <Route path="/notifications"      element={<Suspense fallback={null}><Notifications /></Suspense>} />
          <Route path="/submissions/:id"    element={<SubmissionDetail />} />
          <Route path="/documents/:id"      element={<DocumentPage />} />
          <Route path="/profile"            element={<Profile />} />
          <Route path="/security"           element={<Security />} />
        </Route>

        {Styleguide && (
          <Route path="/styleguide" element={<Suspense fallback={null}><Styleguide /></Suspense>} />
        )}

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  )
}
