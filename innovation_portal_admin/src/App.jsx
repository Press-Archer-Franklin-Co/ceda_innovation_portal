import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { documents as documentsApi } from './lib/api/endpoints'
import { retryUnlessRefused } from './lib/api/refusals'
import { AuthProvider }    from './lib/auth/AuthContext'
import { ProtectedRoute, CapabilityRoute, ToSignIn }  from './lib/auth/ProtectedRoute'
import { OLD_SIGN_IN_PATHS } from './lib/auth/signInPaths'
import { useJudgeOnly } from './lib/auth/useJudgeOnly'
import { useAuth } from './lib/auth/AuthContext'
import AppLayout           from './layout/AppLayout'
import PageErrorBoundary   from './components/ui/PageErrorBoundary'

// Page-level errors are caught by PageErrorBoundary inside AppLayout (shared ErrorState, no stack trace).
function ErrorBoundary({ children }) {
  return <PageErrorBoundary>{children}</PageErrorBoundary>
}

const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'))
const Challenges = lazy(() => import('./pages/programs/Challenges'))
const ChallengeStatus = lazy(() => import('./pages/programs/ChallengeStatus'))
const Submissions = lazy(() => import('./pages/submissions/Submissions'))
const SubmissionDetail = lazy(() => import('./pages/submissions/SubmissionDetail'))
const MyWork = lazy(() => import('./pages/mywork/MyWork'))
const Judging = lazy(() => import('./pages/judging/Judging'))
const ScoreIdea = lazy(() => import('./pages/judging/ScoreIdea'))
const Inbox = lazy(() => import('./pages/inbox/Inbox'))
const LiveChatSettings = lazy(() => import('./pages/inbox/LiveChatSettings'))
const ReviewQueue = lazy(() => import('./pages/review/ReviewQueue'))
const AllScores = lazy(() => import('./pages/judging/AllScores'))
const Reports = lazy(() => import('./pages/reports/Reports'))
const NotificationsProfile = lazy(() => import('./pages/settings/NotificationsProfile'))
const Workflows = lazy(() => import('./pages/admin/workflows/Workflows'))
const WorkflowBuilder = lazy(() => import('./pages/admin/workflows/WorkflowBuilder'))
const WorkflowIdeas = lazy(() => import('./pages/admin/workflows/WorkflowIdeas'))
const MarkingCriteria = lazy(() => import('./pages/challenges/MarkingCriteria'))
const ChallengeBuilder = lazy(() => import('./pages/challenges/ChallengeBuilder'))
const Forms = lazy(() => import('./pages/forms/Forms'))
const FormBuilder = lazy(() => import('./pages/forms/FormBuilder'))
const PlatformSettings = lazy(() => import('./pages/admin/platform/PlatformSettings'))
// C2: WhatsApp and USSD journeys (channels.manage)
const ChannelsOverview = lazy(() => import('./pages/channels/ChannelsOverview'))
const ChannelConnections = lazy(() => import('./pages/channels/ChannelConnections'))
const UssdMenus = lazy(() => import('./pages/channels/UssdMenus'))
const WhatsAppFlows = lazy(() => import('./pages/channels/WhatsAppFlows'))
const TryJourney = lazy(() => import('./pages/channels/TryJourney'))
const Users = lazy(() => import('./pages/users/Users'))
const RolesPermissions = lazy(() => import('./pages/admin/RolesPermissions'))
const AuditLogs = lazy(() => import('./pages/audit/AuditLogs'))
const AllContent = lazy(() => import('./pages/content/AllContent'))
const Policies = lazy(() => import('./pages/content/Policies'))
const HomePageEditor = lazy(() => import('./pages/content/HomePageEditor'))
const NewsList = lazy(() => import('./pages/content/NewsList'))
const PostEditor = lazy(() => import('./pages/content/PostEditor'))
const LeadershipQuotes = lazy(() => import('./pages/content/LeadershipQuotes'))
const Partners = lazy(() => import('./pages/content/Partners'))
const Faqs = lazy(() => import('./pages/content/Faqs'))
const Stories = lazy(() => import('./pages/content/Stories'))
const Approvals = lazy(() => import('./pages/content/Approvals'))
const HackathonPage = lazy(() => import('./pages/content/HackathonPage'))
const HackathonNew = lazy(() => import('./pages/content/HackathonNew'))
const Winners = lazy(() => import('./pages/content/Winners'))
const LeadershipList = lazy(() => import('./pages/content/LeadershipManager'))
const LeadershipCardEditor = lazy(() => import('./pages/content/LeadershipManager').then((m) => ({ default: m.LeadershipCardEditor })))
const FaqList = lazy(() => import('./pages/content/FaqManager'))
const FaqEditor = lazy(() => import('./pages/content/FaqManager').then((m) => ({ default: m.FaqEditor })))
const History = lazy(() => import('./pages/history/History'))

// Dev-only component gallery; not part of the production bundle.
const Styleguide = import.meta.env.DEV ? lazy(() => import('./pages/Styleguide')) : null
const HistorySnapshot = lazy(() => import('./pages/history/HistorySnapshot'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:           30_000,
      retry:               retryUnlessRefused,
      refetchOnWindowFocus: true,
      refetchOnReconnect:   true,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename="/staff">
          <Routes>
            <Route path="/" element={<Landing />} />
            {OLD_SIGN_IN_PATHS.map((path) => (
              <Route key={path} path={path} element={<ToSignIn />} />
            ))}

            {Styleguide && (
              <Route path="/styleguide" element={<Suspense fallback={null}><Styleguide /></Suspense>} />
            )}

            <Route element={<ProtectedRoute />}>
              <Route element={<ErrorBoundary><AppLayout /></ErrorBoundary>}>
                <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />

                <Route path="/programs"     element={<ErrorBoundary><Challenges /></ErrorBoundary>} />
                <Route path="/programs/new" element={<ErrorBoundary><ChallengeBuilder /></ErrorBoundary>} />
                <Route path="/programs/:id" element={<ErrorBoundary><ChallengeStatus /></ErrorBoundary>} />
                <Route path="/programs/:id/edit" element={<ErrorBoundary><ChallengeBuilder /></ErrorBoundary>} />
                <Route path="/programs/:id/settings" element={<ParamRedirect to="/programs/:id/edit?section=basics" />} />

                {/* U8 (3.15 to 3.20). Old addresses redirect to the new screens. */}
                <Route element={<CapabilityRoute need="entries.search" />}>
                  <Route path="/submissions"   element={<ErrorBoundary><Submissions /></ErrorBoundary>} />
                </Route>
                <Route path="/submissions/:id" element={<ErrorBoundary><SubmissionDetail /></ErrorBoundary>} />
                <Route element={<CapabilityRoute need={['entries.assign', 'dashboard.view']} />}>
                  <Route path="/submissions/:id/scores" element={<ErrorBoundary><AllScores /></ErrorBoundary>} />
                </Route>
                <Route path="/documents/:id"   element={<ErrorBoundary><DocumentRedirect /></ErrorBoundary>} />

                {/* C1 live chat: 3.30 Inbox. */}
                <Route element={<CapabilityRoute need="conversations.reply" />}>
                  <Route path="/inbox"         element={<ErrorBoundary><Inbox /></ErrorBoundary>} />
                </Route>

                {/* U4 3.3 Review queue and scoring. */}
                <Route element={<CapabilityRoute need="entries.review" />}>
                  <Route path="/review"        element={<ErrorBoundary><ReviewQueue /></ErrorBoundary>} />
                </Route>

                <Route path="/assignments"     element={<ErrorBoundary><MyWork /></ErrorBoundary>} />
                <Route path="/assignments/:id" element={<WorkItemRedirect />} />
                <Route path="/tasks"           element={<Navigate to="/assignments" replace />} />
                <Route path="/tasks/:id"       element={<WorkItemRedirect />} />

                <Route path="/history" element={<ErrorBoundary><History /></ErrorBoundary>} />
                <Route path="/history/:id" element={<ErrorBoundary><HistorySnapshot /></ErrorBoundary>} />

                <Route element={<CapabilityRoute need="entries.score" />}>
                  <Route path="/judging"       element={<ErrorBoundary><Judging /></ErrorBoundary>} />
                </Route>
                {/* Anyone with a review to score lands here; the API decides (cycle can_score). */}
                <Route path="/judging/:id"     element={<ErrorBoundary><ScoreIdea /></ErrorBoundary>} />
                <Route path="/evaluate/:id"    element={<ParamRedirect to="/judging/:id" />} />
                <Route path="/evaluations/mine" element={<Navigate to="/judging" replace />} />
                <Route path="/evaluations/:id" element={<ParamRedirect to="/judging/:id" />} />

                {/* Each group asks for the capability the API checks on the endpoints behind it (S1). */}
                <Route element={<CapabilityRoute need="entries.assign" />}>
                  <Route path="/admin/workflows"               element={<ErrorBoundary><Workflows /></ErrorBoundary>} />
                  <Route path="/workflows"                     element={<Navigate to="/admin/workflows" replace />} />
                  <Route path="/admin/workflows/:id/builder"   element={<ErrorBoundary><WorkflowBuilder /></ErrorBoundary>} />
                  <Route path="/admin/workflows/:id/instances" element={<ErrorBoundary><WorkflowIdeas /></ErrorBoundary>} />
                </Route>
                <Route element={<CapabilityRoute need="challenges.manage" />}>
                  <Route path="/admin/terms"                   element={<Navigate to="/content/policies" replace />} />
                </Route>
                <Route element={<CapabilityRoute need="channels.manage" />}>
                  {/* C2: 3.33 overview and connections, 3.31 USSD menus, 3.31b WhatsApp flows, 3.32 simulator. */}
                  <Route path="/channels" element={<ErrorBoundary><ChannelsOverview /></ErrorBoundary>} />
                  <Route path="/channels/connections/:kind" element={<ErrorBoundary><ChannelConnections /></ErrorBoundary>} />
                  <Route path="/channels/ussd" element={<ErrorBoundary><UssdMenus /></ErrorBoundary>} />
                  <Route path="/channels/ussd/:id" element={<ErrorBoundary><UssdMenus /></ErrorBoundary>} />
                  <Route path="/channels/whatsapp" element={<ErrorBoundary><WhatsAppFlows /></ErrorBoundary>} />
                  <Route path="/channels/whatsapp/:id" element={<ErrorBoundary><WhatsAppFlows /></ErrorBoundary>} />
                  <Route path="/channels/try" element={<ErrorBoundary><TryJourney /></ErrorBoundary>} />
                  <Route path="/channels/*" element={<Navigate to="/channels" replace />} />
                </Route>
                <Route element={<CapabilityRoute need="settings.manage" />}>
                  <Route path="/admin/platform"                element={<ErrorBoundary><PlatformSettings /></ErrorBoundary>} />
                  <Route path="/admin/live-chat"               element={<ErrorBoundary><LiveChatSettings /></ErrorBoundary>} />
                  <Route path="/admin/roles"                   element={<ErrorBoundary><RolesPermissions /></ErrorBoundary>} />
                </Route>
                <Route element={<CapabilityRoute need={['dashboard.view', 'analytics.view']} />}>
                  <Route path="/reports" element={<ErrorBoundary><Reports /></ErrorBoundary>} />
                </Route>
                {/* U4: Analytics became Reports; old links (and ?tab=responses) still land in the right place. */}
                <Route path="/analytics" element={<OldAnalyticsLink />} />
                <Route element={<CapabilityRoute need="users.manage" />}>
                  <Route path="/users"     element={<ErrorBoundary><Users /></ErrorBoundary>} />
                </Route>
                <Route element={<CapabilityRoute need="audit.view" />}>
                  <Route path="/audit"     element={<ErrorBoundary><AuditLogs /></ErrorBoundary>} />
                </Route>

                <Route element={<CapabilityRoute need="criteria.manage" />}>
                  <Route path="/marking-criteria"               element={<ErrorBoundary><MarkingCriteria /></ErrorBoundary>} />
                </Route>
                <Route element={<CapabilityRoute need="forms.manage" />}>
                  <Route path="/forms"                          element={<ErrorBoundary><Forms /></ErrorBoundary>} />
                  <Route path="/forms/:id"                      element={<ErrorBoundary><FormBuilder /></ErrorBoundary>} />
                </Route>
                {/* Website content editors (U6) need content.edit. Approving is its own capability (content.approve);
                    the approvals list below opens for either, and its buttons follow can_approve / can_send_back. */}
                <Route element={<CapabilityRoute need="content.edit" />}>
                  <Route path="/content"                        element={<ErrorBoundary><AllContent /></ErrorBoundary>} />
                  <Route path="/content/policies"               element={<ErrorBoundary><Policies /></ErrorBoundary>} />
                  <Route path="/content/hackathon"              element={<ErrorBoundary><HackathonPage /></ErrorBoundary>} />
                  <Route path="/content/winners"                element={<ErrorBoundary><Winners /></ErrorBoundary>} />
                  <Route path="/content/home"                   element={<ErrorBoundary><HomePageEditor /></ErrorBoundary>} />
                  <Route path="/content/news"                   element={<ErrorBoundary><NewsList /></ErrorBoundary>} />
                  <Route path="/content/news/new"               element={<ErrorBoundary><PostEditor /></ErrorBoundary>} />
                  <Route path="/content/news/:id"               element={<ErrorBoundary><PostEditor /></ErrorBoundary>} />
                  <Route path="/content/hackathons/new"         element={<ErrorBoundary><HackathonNew /></ErrorBoundary>} />
                  <Route path="/content/hackathons/:id"         element={<ErrorBoundary><HackathonPage /></ErrorBoundary>} />
                  <Route path="/content/winners/new"            element={<Navigate to="/content/winners" replace />} />
                  <Route path="/content/winners/:id"            element={<Navigate to="/content/winners" replace />} />
                  <Route path="/content/leadership"             element={<Navigate to="/content/quotes" replace />} />
                  <Route path="/content/quotes"                 element={<ErrorBoundary><LeadershipQuotes /></ErrorBoundary>} />
                  <Route path="/content/partners"               element={<ErrorBoundary><Partners /></ErrorBoundary>} />
                  <Route path="/content/leadership/new"         element={<ErrorBoundary><LeadershipCardEditor /></ErrorBoundary>} />
                  <Route path="/content/leadership/:id"         element={<ErrorBoundary><LeadershipCardEditor /></ErrorBoundary>} />
                  <Route path="/content/faqs"                   element={<ErrorBoundary><Faqs /></ErrorBoundary>} />
                  <Route path="/content/stories"                element={<ErrorBoundary><Stories /></ErrorBoundary>} />
                  <Route path="/content/faqs/new"               element={<ErrorBoundary><FaqEditor /></ErrorBoundary>} />
                  <Route path="/content/faqs/:id"               element={<ErrorBoundary><FaqEditor /></ErrorBoundary>} />
                </Route>
                {/* Approvers who do not edit (content.approve only) still reach the list; its buttons follow the API. */}
                <Route element={<CapabilityRoute need={['content.edit', 'content.approve']} />}>
                  <Route path="/content/approvals"              element={<ErrorBoundary><Approvals /></ErrorBoundary>} />
                </Route>

                <Route path="/settings" element={<NotificationsProfile />} />



                <Route path="*" element={
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <p className="text-4xl font-bold text-ceda-border mb-2">404</p>
                    <p className="text-ceda-muted text-sm">Page not found.</p>
                  </div>
                } />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

/** People who only judge start on their judging list (3.17); everyone else on the dashboard. */
function Landing() {
  const judgeOnly = useJudgeOnly()
  const { loading } = useAuth()
  if (loading) return null
  return <Navigate to={judgeOnly ? '/judging' : '/dashboard'} replace />
}

/** /evaluate/:id and the like: same id, new address. */
function ParamRedirect({ to }) {
  const { id } = useParams()
  return <Navigate to={to.replace(':id', id)} replace />
}

/** Old task and assignment pages open the item in My work. */
function WorkItemRedirect() {
  const { id } = useParams()
  return <Navigate to={`/assignments?item=${encodeURIComponent(id)}`} replace />
}

/** The old document page: the document now lives in its idea's Documents tab (3.16). */
function DocumentRedirect() {
  const { id } = useParams()
  const doc = useQuery({ queryKey: ['documents', id], queryFn: () => documentsApi.get(id), retry: false })
  if (doc.isLoading) return null
  const submission = doc.data?.submission ?? doc.data?.submission_id
  if (!submission) return <Navigate to="/submissions" replace />
  return <Navigate to={`/submissions/${submission}?tab=documents`} replace />
}

function OldAnalyticsLink() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  if (params.get('tab') === 'responses') params.set('tab', 'answers')
  else params.delete('tab')
  const query = params.toString()
  return <Navigate to={`/reports${query ? `?${query}` : ''}`} replace />
}
