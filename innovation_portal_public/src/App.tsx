import { lazy, Suspense } from 'react'
import { Navigate, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout        from './components/layout/Layout'
import PrivateRoute  from './components/ui/PrivateRoute'
const Home = lazy(() => import('./pages/Home'))
const NotFound = lazy(() => import('./pages/NotFound'))
const About = lazy(() => import('./pages/About'))
const Guidelines = lazy(() => import('./pages/Guidelines'))
const FAQ = lazy(() => import('./pages/FAQ'))
const Challenges = lazy(() => import('./pages/Challenges'))
const Suggestions = lazy(() => import('./pages/Suggestions'))
const Innovate = lazy(() => import('./pages/Innovate'))
const Skills = lazy(() => import('./pages/Skills'))
const Login = lazy(() => import('./pages/Login'))
const SignUp = lazy(() => import('./pages/SignUp'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const MfaChallenge = lazy(() => import('./pages/MfaChallenge'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const Profile = lazy(() => import('./pages/Profile'))
const Security = lazy(() => import('./pages/Security'))
const TermsOfAgreement = lazy(() => import('./pages/TermsOfAgreement'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'))
const News = lazy(() => import('./pages/News'))
const ArticleDetail = lazy(() => import('./pages/ArticleDetail'))
const HackathonDetail = lazy(() => import('./pages/HackathonDetail'))
const SubmissionDetail = lazy(() => import('./pages/SubmissionDetail'))
const DocumentPage = lazy(() => import('./pages/DocumentPage'))
const SpecialistInvite = lazy(() => import('./pages/SpecialistInvite'))
const JudgeInvite = lazy(() => import('./pages/JudgeInvite'))
const CodeSignIn = lazy(() => import('./pages/innovator/CodeSignIn'))
const InnovatorHome = lazy(() => import('./pages/innovator/InnovatorHome'))
const MyIdeas = lazy(() => import('./pages/innovator/MyIdeas'))
const TrackIdea = lazy(() => import('./pages/innovator/TrackIdea'))
const IdeaForm = lazy(() => import('./pages/innovator/IdeaForm'))
const Notifications = lazy(() => import('./pages/innovator/Notifications'))
import { I18nProvider } from './i18n'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import PageSkeleton from './components/ui/PageSkeleton'

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
    // Pages outside the site layout (sign in and the like) load under this boundary;
    // pages inside it load under the one in Layout, so the header and footer stay.
    <Suspense fallback={<div className="max-w-[1200px] mx-auto px-5 py-10"><PageSkeleton shape="form" /></div>}>
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

        <Route path="/sign-in"     element={<PublicOnlyRoute><CodeSignIn /></PublicOnlyRoute>} />

        <Route path="/terms-of-agreement" element={<TermsOfAgreement />} />
        <Route path="/privacy-policy"     element={<PrivacyPolicy />} />
        <Route path="/terms-of-use"       element={<TermsOfUse />} />

        <Route element={<PrivateRoute />}>
          <Route path="/dashboard"          element={<InnovatorHome />} />
          <Route path="/my-ideas"           element={<MyIdeas />} />
          <Route path="/my-ideas/draft/:id" element={<IdeaForm />} />
          <Route path="/my-ideas/:id"       element={<TrackIdea />} />
          <Route path="/notifications"      element={<Notifications />} />
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
    </Suspense>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  )
}
