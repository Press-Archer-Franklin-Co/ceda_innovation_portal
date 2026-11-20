import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { retryUnlessRefused } from './lib/api/refusals'
import { AuthProvider }    from './lib/auth/AuthContext'
import { ProtectedRoute, CapabilityRoute }  from './lib/auth/ProtectedRoute'
import AppLayout           from './layout/AppLayout'
import PageErrorBoundary   from './components/ui/PageErrorBoundary'

// Page-level errors are caught by PageErrorBoundary inside AppLayout (shared ErrorState, no stack trace).
function ErrorBoundary({ children }) {
  return <PageErrorBoundary>{children}</PageErrorBoundary>
}

const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'))
const Programs = lazy(() => import('./pages/programs/Programs'))
const ProgramDetail = lazy(() => import('./pages/programs/ProgramDetail'))
const ProgramEditor = lazy(() => import('./pages/programs/ProgramEditor'))
const Submissions = lazy(() => import('./pages/submissions/Submissions'))
const SubmissionDetail = lazy(() => import('./pages/submissions/SubmissionDetail'))
const MyWork = lazy(() => import('./pages/assignments/MyWork'))
const EvaluationForm = lazy(() => import('./pages/evaluation/EvaluationForm'))
const Analytics = lazy(() => import('./pages/analytics/Analytics'))
const Settings = lazy(() => import('./pages/settings/Settings'))
const AssignmentDetail = lazy(() => import('./pages/assignments/AssignmentDetail'))
const DocumentPage = lazy(() => import('./pages/documents/DocumentPage'))
const AdminWorkflows = lazy(() => import('./pages/admin/workflows/AdminWorkflows'))
const WorkflowBuilder = lazy(() => import('./pages/admin/workflows/WorkflowBuilder'))
const WorkflowInstances = lazy(() => import('./pages/admin/workflows/WorkflowInstances'))
const MarkingCriteria = lazy(() => import('./pages/challenges/MarkingCriteria'))
const ChallengeBuilder = lazy(() => import('./pages/challenges/ChallengeBuilder'))
const Forms = lazy(() => import('./pages/forms/Forms'))
const FormBuilder = lazy(() => import('./pages/forms/FormBuilder'))
const TermsManager = lazy(() => import('./pages/admin/TermsManager'))
const PlatformSettings = lazy(() => import('./pages/admin/platform/PlatformSettings'))
const Users = lazy(() => import('./pages/users/Users'))
const AuditLogs = lazy(() => import('./pages/audit/AuditLogs'))
const ContentList = lazy(() => import('./pages/content/ContentList'))
const ContentEditor = lazy(() => import('./pages/content/ContentEditor'))
const HackathonContentEditor = lazy(() => import('./pages/content/HackathonContentEditor'))
const WinnersManager = lazy(() => import('./pages/content/WinnersManager'))
const LeadershipList = lazy(() => import('./pages/content/LeadershipManager'))
const LeadershipCardEditor = lazy(() => import('./pages/content/LeadershipManager').then((m) => ({ default: m.LeadershipCardEditor })))
const FaqList = lazy(() => import('./pages/content/FaqManager'))
const FaqEditor = lazy(() => import('./pages/content/FaqManager').then((m) => ({ default: m.FaqEditor })))
const EvaluationView = lazy(() => import('./pages/evaluate/EvaluationView'))
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
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {Styleguide && (
              <Route path="/styleguide" element={<Suspense fallback={null}><Styleguide /></Suspense>} />
            )}

            <Route element={<ProtectedRoute />}>
              <Route element={<ErrorBoundary><AppLayout /></ErrorBoundary>}>
                <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />

                <Route path="/programs"     element={<ErrorBoundary><Programs /></ErrorBoundary>} />
                <Route path="/programs/new" element={<ErrorBoundary><ChallengeBuilder /></ErrorBoundary>} />
                <Route path="/programs/:id" element={<ErrorBoundary><ProgramDetail /></ErrorBoundary>} />
                <Route path="/programs/:id/edit" element={<ErrorBoundary><ChallengeBuilder /></ErrorBoundary>} />
                <Route path="/programs/:id/settings" element={<ErrorBoundary><ProgramEditor /></ErrorBoundary>} />

                <Route path="/submissions"     element={<ErrorBoundary><Submissions /></ErrorBoundary>} />
                <Route path="/submissions/:id" element={<ErrorBoundary><SubmissionDetail /></ErrorBoundary>} />
                <Route path="/documents/:id"   element={<ErrorBoundary><DocumentPage /></ErrorBoundary>} />

                <Route path="/assignments"     element={<ErrorBoundary><MyWork /></ErrorBoundary>} />
                <Route path="/assignments/:id" element={<ErrorBoundary><AssignmentDetail /></ErrorBoundary>} />

                <Route path="/history" element={<ErrorBoundary><History /></ErrorBoundary>} />
                <Route path="/history/:id" element={<ErrorBoundary><HistorySnapshot /></ErrorBoundary>} />

                <Route path="/evaluate/:id" element={<ErrorBoundary><EvaluationView /></ErrorBoundary>} />
                <Route path="/tasks"     element={<Navigate to="/assignments" replace />} />
                <Route path="/tasks/:id" element={<ErrorBoundary><AssignmentDetail /></ErrorBoundary>} />

                <Route path="/evaluations/mine" element={<Navigate to="/assignments" replace />} />
                <Route path="/evaluations/:id"  element={<ErrorBoundary><EvaluationForm /></ErrorBoundary>} />

                {/* Each group asks for the capability the API checks on the endpoints behind it (S1). */}
                <Route element={<CapabilityRoute need="entries.assign" />}>
                  <Route path="/admin/workflows"               element={<ErrorBoundary><AdminWorkflows /></ErrorBoundary>} />
                  <Route path="/admin/workflows/:id/builder"   element={<ErrorBoundary><WorkflowBuilder /></ErrorBoundary>} />
                  <Route path="/admin/workflows/:id/instances" element={<ErrorBoundary><WorkflowInstances /></ErrorBoundary>} />
                </Route>
                <Route element={<CapabilityRoute need="challenges.manage" />}>
                  <Route path="/admin/terms"                   element={<ErrorBoundary><TermsManager /></ErrorBoundary>} />
                </Route>
                <Route element={<CapabilityRoute need="settings.manage" />}>
                  <Route path="/admin/platform"                element={<ErrorBoundary><PlatformSettings /></ErrorBoundary>} />
                </Route>
                <Route element={<CapabilityRoute need="analytics.view" />}>
                  <Route path="/analytics" element={<ErrorBoundary><Analytics /></ErrorBoundary>} />
                </Route>
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
                {/* Managers hold content.approve but NOT content.edit. An approvals screen (U6, GET /api/content/approvals/)
                    goes in its own group with need={['content.edit', 'content.approve']}, never in this one, and its
                    Approve / Send back buttons check can('content.approve'). */}
                <Route element={<CapabilityRoute need="content.edit" />}>
                  <Route path="/content"                        element={<ErrorBoundary><ContentList /></ErrorBoundary>} />
                  <Route path="/content/leadership"             element={<Navigate to="/content?tab=leadership" replace />} />
                  <Route path="/content/faqs"                   element={<Navigate to="/content?tab=faqs" replace />} />
                  <Route path="/content/news/new"               element={<ErrorBoundary><ContentEditor /></ErrorBoundary>} />
                  <Route path="/content/news/:id"               element={<ErrorBoundary><ContentEditor /></ErrorBoundary>} />
                  <Route path="/content/hackathons/new"         element={<ErrorBoundary><HackathonContentEditor /></ErrorBoundary>} />
                  <Route path="/content/hackathons/:id"         element={<ErrorBoundary><HackathonContentEditor /></ErrorBoundary>} />
                  <Route path="/content/winners/new"            element={<ErrorBoundary><WinnersManager /></ErrorBoundary>} />
                  <Route path="/content/winners/:id"            element={<ErrorBoundary><WinnersManager /></ErrorBoundary>} />
                  <Route path="/content/leadership/new"         element={<ErrorBoundary><LeadershipCardEditor /></ErrorBoundary>} />
                  <Route path="/content/leadership/:id"         element={<ErrorBoundary><LeadershipCardEditor /></ErrorBoundary>} />
                  <Route path="/content/faqs/new"               element={<ErrorBoundary><FaqEditor /></ErrorBoundary>} />
                  <Route path="/content/faqs/:id"               element={<ErrorBoundary><FaqEditor /></ErrorBoundary>} />
                </Route>

                <Route path="/settings" element={<Settings />} />



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
