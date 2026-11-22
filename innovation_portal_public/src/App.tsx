import { lazy, Suspense, useRef } from 'react'
import { Navigate, Routes, Route, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout        from './components/layout/Layout'
import PrivateRoute  from './components/ui/PrivateRoute'
const Home = lazy(() => import('./pages/Home'))
const IdeaSent = lazy(() => import('./pages/IdeaSent'))
const ChallengeDetail = lazy(() => import('./pages/ChallengeDetail'))
const ChallengeEnter = lazy(() => import('./pages/ChallengeEnter'))
const ChallengeResults = lazy(() => import('./pages/ChallengeResults'))
const MyResult = lazy(() => import('./pages/innovator/MyResult'))
const NotFound = lazy(() => import('./pages/NotFound'))
const About = lazy(() => import('./pages/About'))
const Guidelines = lazy(() => import('./pages/Guidelines'))
const FAQ = lazy(() => import('./pages/FAQ'))
const Accessibility = lazy(() => import('./pages/Accessibility'))
const Challenges = lazy(() => import('./pages/Challenges'))
const Submit = lazy(() => import('./pages/Submit'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const SubscriptionLink = lazy(() => import('./pages/SubscriptionLink'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const Profile = lazy(() => import('./pages/Profile'))
const Security = lazy(() => import('./pages/Security'))
const TermsOfAgreement = lazy(() => import('./pages/TermsOfAgreement'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'))
const News = lazy(() => import('./pages/News'))
const PostDetail = lazy(() => import('./pages/PostDetail'))
const DocumentPage = lazy(() => import('./pages/DocumentPage'))
const SpecialistInvite = lazy(() => import('./pages/SpecialistInvite'))
const JudgeInvite = lazy(() => import('./pages/JudgeInvite'))
const SignIn = lazy(() => import('./pages/SignIn'))
const InnovatorHome = lazy(() => import('./pages/innovator/InnovatorHome'))
const MyIdeas = lazy(() => import('./pages/innovator/MyIdeas'))
const TrackIdea = lazy(() => import('./pages/innovator/TrackIdea'))
const IdeaForm = lazy(() => import('./pages/innovator/IdeaForm'))
const Notifications = lazy(() => import('./pages/innovator/Notifications'))
const PreviewForm = lazy(() => import('./pages/innovator/PreviewForm'))
const PreviewHome = lazy(() => import('./pages/PreviewHome'))
import { I18nProvider } from './i18n'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import PageSkeleton from './components/ui/PageSkeleton'
import PageErrorBoundary from './components/ui/PageErrorBoundary'
import { isStaff } from './lib/roles'

// Dev-only component gallery; not part of the production bundle.
const Styleguide = import.meta.env.DEV ? lazy(() => import('./pages/Styleguide')) : null

// U7: these all lead to the one sign-in page, keeping ?next=...
const OLD_SIGN_IN_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/mfa']

function ToSignIn() {
  const location = useLocation()
  return <Navigate to={{ pathname: '/sign-in', search: location.search }} state={location.state} replace />
}

/**
 * /sign-in: someone already signed in when the page opens goes on to `next` (or their home).
 * It does not jump away in the middle of signing in: the page sends
 * people on itself, to the place the server allowed.
 */
function SignInRoute() {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()
  const signedInOnOpen = useRef<boolean | null>(null)
  if (isLoading) return null
  if (signedInOnOpen.current === null) signedInOnOpen.current = isAuthenticated
  if (signedInOnOpen.current) {
    const next = new URLSearchParams(location.search).get('next') || ''
    const home = isStaff(user) ? '/staff/' : '/dashboard'
    const target = next.startsWith('/') && !next.startsWith('//') ? next : home
    if (target.startsWith('/staff')) {
      window.location.replace(isStaff(user) ? target : '/dashboard')
      return null
    }
    return <Navigate to={target} replace />
  }
  return <SignIn />
}

/** "/" is the website home for visitors and staff; signed-in innovators go to their dashboard. */
function HomeOrDashboard() {
  const { isAuthenticated, isLoading, user } = useAuth()
  if (isLoading) return <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10"><PageSkeleton /></div>
  if (isAuthenticated && !isStaff(user)) return <Navigate to="/dashboard" replace />
  return <Home />
}

/**
 * The old submission page (/innovate) is gone. Its links still work:
 * ?draft= opens that draft in the full form, ?program= enters that challenge (its own form, U10),
 * ?submission= opens the idea's page, and the bare address starts a new idea.
 */
function InnovateRedirect() {
  const [params] = useSearchParams()
  const draft = params.get('draft')
  const program = params.get('program')
  const submission = params.get('submission')
  const to = draft
    ? `/my-ideas/draft/${encodeURIComponent(draft)}`
    : submission
      ? `/my-ideas/${encodeURIComponent(submission)}`
      : program
        ? `/challenges/${encodeURIComponent(program)}/enter`
        : '/submit'
  return <Navigate to={to} replace />
}

/** Old submission detail addresses go to the idea's page (2.2). */
function SubmissionRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={`/my-ideas/${encodeURIComponent(id)}`} replace />
}

function AppRoutes() {
  const { pathname } = useLocation()
  return (
    // Pages outside the site layout (sign in and the like) load under this boundary;
    // pages inside it load under the one in Layout, so the header and footer stay.
    <PageErrorBoundary resetKey={pathname}>
    <Suspense fallback={<div className="max-w-[1200px] mx-auto px-5 py-10"><PageSkeleton shape="form" /></div>}>
    <Routes>
      {/* U7: one sign-in page. The old sign-in, sign-up, password reset and two-step pages are gone. */}
      {OLD_SIGN_IN_PATHS.map((path) => (
        <Route key={path} path={path} element={<ToSignIn />} />
      ))}

      <Route path="/verify-email"    element={<VerifyEmail />} />

      <Route path="/auth/callback"   element={<AuthCallback />} />


      {/* Staff form builder preview (U5): shown in an iframe in the staff console, no site chrome. */}
      <Route path="/preview/form" element={<PreviewForm />} />
      {/* Staff home page editor preview (U6, 3.8), same idea. */}
      <Route path="/preview/home" element={<PreviewHome />} />

      <Route element={<Layout />}>
        <Route path="/"            element={<HomeOrDashboard />} />
        <Route path="/home"        element={<Home />} />
        <Route path="/idea-sent"   element={<IdeaSent />} />
        <Route path="/about"       element={<About />} />
        <Route path="/guidelines"  element={<Guidelines />} />
        <Route path="/faq"         element={<FAQ />} />
        <Route path="/accessibility" element={<Accessibility />} />
        {/* 1.15: invitations sit in the normal header and footer. */}
        <Route path="/specialist-invite/:token" element={<SpecialistInvite />} />
        <Route path="/judge-invite/:token" element={<JudgeInvite />} />
        <Route path="/challenges"  element={<Challenges />} />
        <Route path="/challenges/:slug" element={<ChallengeDetail />} />
        <Route path="/challenges/:slug/enter" element={<ChallengeEnter />} />
        <Route path="/challenges/:slug/results" element={<ChallengeResults />} />
        <Route path="/submit"      element={<Submit />} />
        <Route path="/innovate"    element={<InnovateRedirect />} />
        {/* Old pages nothing links to any more (D3): sent somewhere useful instead. */}
        <Route path="/suggestions" element={<Navigate to="/faq" replace />} />
        <Route path="/skills"      element={<Navigate to="/" replace />} />
        <Route path="/hackathons/:id" element={<Navigate to="/challenges" replace />} />
        <Route path="/news"        element={<News />} />
        <Route path="/subscribe/confirm/:token" element={<SubscriptionLink action="confirm" />} />
        <Route path="/unsubscribe/:token" element={<SubscriptionLink action="unsubscribe" />} />
        {/* TODO(U2): own Stories page; until then the news feed. */}
        <Route path="/stories"     element={<News />} />
        <Route path="/news/:slug"  element={<PostDetail />} />

        <Route path="/sign-in"     element={<SignInRoute />} />

        <Route path="/terms-of-agreement" element={<TermsOfAgreement />} />
        <Route path="/privacy-policy"     element={<PrivacyPolicy />} />
        <Route path="/terms-of-use"       element={<TermsOfUse />} />

        <Route element={<PrivateRoute />}>
          <Route path="/dashboard"          element={<InnovatorHome />} />
          <Route path="/my-ideas"           element={<MyIdeas />} />
          <Route path="/my-ideas/draft/:id" element={<IdeaForm />} />
          <Route path="/challenges/:slug/entry/:id" element={<IdeaForm />} />
          <Route path="/challenges/:slug/my-result" element={<MyResult />} />
          <Route path="/my-ideas/:id"       element={<TrackIdea />} />
          <Route path="/notifications"      element={<Notifications />} />
          <Route path="/submissions/:id"    element={<SubmissionRedirect />} />
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
    </PageErrorBoundary>
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
