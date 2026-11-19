import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider }    from './lib/auth/AuthContext'
import { ProtectedRoute, AdminRoute, OfficerRoute }  from './lib/auth/ProtectedRoute'
import AppLayout           from './layout/AppLayout'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace' }}>
          <h2 style={{ color: '#B42318' }}>Render Error</h2>
          <pre style={{ background: '#fee2e2', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>
            {this.state.error?.message}{'\n\n'}{this.state.error?.stack}
          </pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

import Dashboard           from './pages/dashboard/Dashboard'
import Programs            from './pages/programs/Programs'
import ProgramDetail       from './pages/programs/ProgramDetail'
import ProgramEditor       from './pages/programs/ProgramEditor'
import Submissions         from './pages/submissions/Submissions'
import SubmissionDetail    from './pages/submissions/SubmissionDetail'
import MyWork              from './pages/assignments/MyWork'
import EvaluationForm      from './pages/evaluation/EvaluationForm'
import Analytics           from './pages/analytics/Analytics'
import Settings            from './pages/settings/Settings'
import AssignmentDetail    from './pages/assignments/AssignmentDetail'
import DocumentPage        from './pages/documents/DocumentPage'
import AdminWorkflows      from './pages/admin/workflows/AdminWorkflows'
import WorkflowBuilder     from './pages/admin/workflows/WorkflowBuilder'
import WorkflowInstances   from './pages/admin/workflows/WorkflowInstances'
import MarkingCriteriaLibrary from './pages/admin/MarkingCriteriaLibrary'
import TermsManager         from './pages/admin/TermsManager'
import PlatformSettings     from './pages/admin/platform/PlatformSettings'
import Users               from './pages/users/Users'
import AuditLogs           from './pages/audit/AuditLogs'
import ContentList         from './pages/content/ContentList'
import ContentEditor       from './pages/content/ContentEditor'
import HackathonContentEditor from './pages/content/HackathonContentEditor'
import WinnersManager      from './pages/content/WinnersManager'
import LeadershipList, { LeadershipCardEditor } from './pages/content/LeadershipManager'
import FaqList, { FaqEditor } from './pages/content/FaqManager'
import EvaluationView     from './pages/evaluate/EvaluationView'
import History            from './pages/history/History'
import HistorySnapshot    from './pages/history/HistorySnapshot'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:           30_000,
      retry:               1,
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

            <Route element={<ProtectedRoute />}>
              <Route element={<ErrorBoundary><AppLayout /></ErrorBoundary>}>
                <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />

                <Route path="/programs"     element={<ErrorBoundary><Programs /></ErrorBoundary>} />
                <Route path="/programs/new" element={<ErrorBoundary><ProgramEditor /></ErrorBoundary>} />
                <Route path="/programs/:id" element={<ErrorBoundary><ProgramDetail /></ErrorBoundary>} />
                <Route path="/programs/:id/edit" element={<ErrorBoundary><ProgramEditor /></ErrorBoundary>} />

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

                <Route element={<AdminRoute />}>
                  <Route path="/admin/workflows"               element={<ErrorBoundary><AdminWorkflows /></ErrorBoundary>} />
                  <Route path="/admin/workflows/:id/builder"   element={<ErrorBoundary><WorkflowBuilder /></ErrorBoundary>} />
                  <Route path="/admin/workflows/:id/instances" element={<ErrorBoundary><WorkflowInstances /></ErrorBoundary>} />
                  <Route path="/marking-criteria"              element={<ErrorBoundary><MarkingCriteriaLibrary /></ErrorBoundary>} />
                  <Route path="/admin/terms"                   element={<ErrorBoundary><TermsManager /></ErrorBoundary>} />
                  <Route path="/admin/platform"                element={<ErrorBoundary><PlatformSettings /></ErrorBoundary>} />
                </Route>

                <Route element={<AdminRoute />}>
                  <Route path="/analytics" element={<ErrorBoundary><Analytics /></ErrorBoundary>} />
                  <Route path="/users"     element={<ErrorBoundary><Users /></ErrorBoundary>} />
                  <Route path="/audit"     element={<ErrorBoundary><AuditLogs /></ErrorBoundary>} />
                </Route>


                <Route element={<OfficerRoute />}>
                  <Route path="/content"                        element={<ErrorBoundary><ContentList /></ErrorBoundary>} />
                  <Route path="/content/news/new"               element={<ErrorBoundary><ContentEditor /></ErrorBoundary>} />
                  <Route path="/content/news/:id"               element={<ErrorBoundary><ContentEditor /></ErrorBoundary>} />
                  <Route path="/content/hackathons/new"         element={<ErrorBoundary><HackathonContentEditor /></ErrorBoundary>} />
                  <Route path="/content/hackathons/:id"         element={<ErrorBoundary><HackathonContentEditor /></ErrorBoundary>} />
                  <Route path="/content/winners/new"            element={<ErrorBoundary><WinnersManager /></ErrorBoundary>} />
                  <Route path="/content/winners/:id"            element={<ErrorBoundary><WinnersManager /></ErrorBoundary>} />
                  <Route path="/content/leadership"             element={<Navigate to="/content?tab=leadership" replace />} />
                  <Route path="/content/leadership/new"         element={<ErrorBoundary><LeadershipCardEditor /></ErrorBoundary>} />
                  <Route path="/content/leadership/:id"         element={<ErrorBoundary><LeadershipCardEditor /></ErrorBoundary>} />
                  <Route path="/content/faqs"                   element={<Navigate to="/content?tab=faqs" replace />} />
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
