import { client } from './client'

export const auth = {
  login:         (body)   => client.post('/api/auth/login/', body, { skipAuthRedirect: true }),
  logout:        (body)   => client.post('/api/auth/logout/', body),
  refresh:       (body)   => client.post('/api/auth/refresh/', body, { skipAuthRedirect: true }),
  me:            (signal) => client.get('/api/profile/', undefined, signal),
  // The signed-in user with `capabilities` (S1). /api/profile/ does not carry them.
  whoami:        (signal) => client.get('/api/auth/me/', undefined, signal),
  changePassword:(body)   => client.post('/api/auth/change-password/', body),
  forgotPassword:(body)   => client.post('/api/auth/forgot-password/', body),
}

export const termsAndConditions = {
  list:   ()        => client.get('/api/programs/terms/'),
  get:    (id)      => client.get(`/api/programs/terms/${id}/`),
  create: (body)    => client.post('/api/programs/terms/', body),
  update: (id, b)   => client.patch(`/api/programs/terms/${id}/`, b),
  delete: (id)      => client.delete(`/api/programs/terms/${id}/`),
}

export const programs = {
  types:        ()       => client.get('/api/programs/types/'),
  list:         (params) => client.get('/api/programs/', params),
  get:          (id)     => client.get(`/api/programs/${id}/`),
  create:       (body)   => client.post('/api/programs/', body),
  update:       (id, b)  => client.patch(`/api/programs/${id}/`, b),
  delete:       (id)     => client.delete(`/api/programs/${id}/`),
  judges:       (id)     => client.get(`/api/programs/${id}/judges/`),
  addJudge:     (id, b)  => client.post(`/api/programs/${id}/judges/`, b),
  removeJudge:  (id, judgeId) => client.delete(`/api/programs/${id}/judges/${judgeId}/`),
  publish:      (id)     => client.post(`/api/programs/${id}/publish/`),
  unpublish:    (id)     => client.post(`/api/programs/${id}/unpublish/`),
  close:        (id)     => client.post(`/api/programs/${id}/close/`),
  setStatus:    (id, b)  => client.post(`/api/programs/${id}/set-status/`, b),
  availability: (id)     => client.get(`/api/programs/${id}/availability/`),
  stages:       (id)     => client.get(`/api/programs/${id}/stages/`),
  form:         (id)     => client.get(`/api/programs/${id}/form/`),
  formSections: (id)     => client.get(`/api/programs/${id}/form-sections/`),
  createFormSection: (id, body) => client.post(`/api/programs/${id}/form-sections/`, body),
  updateFormSection: (id, body) => client.patch(`/api/programs/form-sections/${id}/`, body),
  deleteFormSection: (id) => client.delete(`/api/programs/form-sections/${id}/`),
  createField:   (sectionId, body) => client.post(`/api/programs/form-sections/${sectionId}/fields/`, body),
  updateField:   (id, body) => client.patch(`/api/programs/form-fields/${id}/`, body),
  deleteField:   (id) => client.delete(`/api/programs/form-fields/${id}/`),
  createFieldOption: (fieldId, body) => client.post(`/api/programs/form-fields/${fieldId}/options/`, body),
  updateFieldOption: (id, body) => client.patch(`/api/programs/form-field-options/${id}/`, body),
  deleteFieldOption: (id) => client.delete(`/api/programs/form-field-options/${id}/`),
  outcomes:     (id)     => client.get(`/api/programs/${id}/outcomes/`),
  publicList:   (params) => client.get('/api/programs/public/', params),
}

export const submissions = {
  list:            (params) => client.get('/api/submissions/', params),
  get:             (id)     => client.get(`/api/submissions/${id}/`),
  create:          (body)   => client.post('/api/submissions/', body),
  update:          (id, b)  => client.patch(`/api/submissions/${id}/`, b),
  delete:          (id)     => client.delete(`/api/submissions/${id}/`),
  submit:          (id)     => client.post(`/api/submissions/${id}/submit/`),
  resubmit:        (id)     => client.post(`/api/submissions/${id}/resubmit/`),
  assign:          (id, b)  => client.post(`/api/submissions/${id}/assign/`, b),
  notes:           (id)     => client.get(`/api/submissions/${id}/notes/`),
  addNote:         (id, b)  => client.post(`/api/submissions/${id}/notes/`, b),
  history:         (id)     => client.get(`/api/submissions/${id}/history/`),
  assignments:     (id)     => client.get(`/api/submissions/${id}/assignments/`),
  workflow:        (id)     => client.get(`/api/submissions/${id}/workflow/`),
  workflowHistory: (id)     => client.get(`/api/submissions/${id}/workflow/history/`),
  workflowAction:  (id, b)  => client.post(`/api/submissions/${id}/workflow-action/`, b),
  forceAdvance:    (id, b)  => client.post(`/api/submissions/${id}/workflow-action/force-advance/`, b),
  forceClose:      (id, b)  => client.post(`/api/submissions/${id}/workflow-action/force-close/`, b),
  evaluations:     (id)     => client.get(`/api/submissions/${id}/evaluations/`),
  evaluate:        (id, b)  => client.post(`/api/submissions/${id}/evaluate/`, b),
  outcome:         (id)     => client.get(`/api/submissions/${id}/outcome/`),
  tracking:        (id)     => client.get(`/api/submissions/${id}/tracking-detail/`),
  tasks:           (id)     => client.get(`/api/submissions/${id}/tasks/`),
  responses:       (id)     => client.get(`/api/submissions/${id}/responses/`),
  screen:          (id, b)  => client.post(`/api/submissions/${id}/screen/`, b),
  mySubmissions:   (params) => client.get('/api/submissions/my-submissions/', params),
  audit:              (id)     => client.get(`/api/submissions/${id}/audit/`),
  inviteSpecialist:   (id, b)  => client.post(`/api/submissions/${id}/invite-specialist/`, b),
  specialistInvites:  (id)     => client.get(`/api/submissions/${id}/specialist-invitations/`),
}

export const specialistInvitations = {
  revoke:  (id)  => client.delete(`/api/assignments/specialist-invitations/${id}/`),
  resend:  (id)  => client.post(`/api/assignments/specialist-invitations/${id}/resend/`),
}

export const assignments = {
  list:          (params) => client.get('/api/assignments/', params),
  get:           (id)     => client.get(`/api/assignments/${id}/`),
  create:        (body)   => client.post('/api/assignments/', body),
  claimSubmission:(id)    => client.post(`/api/assignments/claim-submission/${id}/`),
  accept:        (id)     => client.post(`/api/assignments/${id}/accept/`),
  decline:       (id)     => client.post(`/api/assignments/${id}/decline/`),
  complete:      (id, b)  => client.post(`/api/assignments/${id}/complete/`, b),
  reassign:      (id, b)  => client.post(`/api/assignments/${id}/reassign/`, b),
  unassign:      (id)     => client.post(`/api/assignments/${id}/unassign/`),
  history:       (id)     => client.get(`/api/assignments/${id}/history/`),
  overdue:       ()       => client.get('/api/assignments/overdue/'),
  reviewerQueue: (params) => client.get('/api/reviewer-queue/', params),
  reviewerStats: ()       => client.get('/api/reviewer-queue/stats/'),
  suggestions:   (params) => client.get('/api/reviewer-suggestions/', params),
}

export const evaluations = {
  myAssigned: (params)         => client.get('/api/evaluations/my-assigned/', params),
  pending:    (params)         => client.get('/api/evaluations/pending/', params),
  overdue:    ()               => client.get('/api/evaluations/overdue/'),
  save:       (subId, b)       => client.post(`/api/evaluations/${subId}/scores/`, b),
  submit:     (subId, b)       => client.post(`/api/evaluations/${subId}/submit/`, b),
  summary:    (subId)          => client.get(`/api/evaluations/${subId}/summary/`),
  rubric:     (subId)          => client.get(`/api/evaluations/${subId}/rubric/`),
  ranking:    (progId)         => client.get(`/api/evaluations/programs/${progId}/ranking/`),

  myCycle:          (subId)         => client.get(`/api/evaluations/${subId}/cycle/`),
  saveCycleScores:  (subId, b)      => client.post(`/api/evaluations/${subId}/cycle/scores/`, b),
  submitCycle:      (subId, b)      => client.post(`/api/evaluations/${subId}/cycle/submit/`, b ?? {}),
  listCycles:       (subId)         => client.get(`/api/evaluations/${subId}/cycles/`),
  cycleSummary:     (subId, cycId)  => client.get(`/api/evaluations/${subId}/cycles/${cycId}/summary/`),
  cycleAction:      (subId, cycId, action, body) => client.post(`/api/evaluations/${subId}/cycles/${cycId}/${action}/`, body ?? {}),
  getStageConfig:   (stepId)        => client.get(`/api/evaluations/steps/${stepId}/evaluation-config/`),
  setStageConfig:   (stepId, b)     => client.put(`/api/evaluations/steps/${stepId}/evaluation-config/`, b),
  listCriteria:     (stepId)        => client.get(`/api/evaluations/steps/${stepId}/evaluation-config/criteria/`),
  addCriterion:     (stepId, b)     => client.post(`/api/evaluations/steps/${stepId}/evaluation-config/criteria/`, b),
  updateCriterion:  (stepId, crId, b) => client.patch(`/api/evaluations/steps/${stepId}/evaluation-config/criteria/${crId}/`, b),
  deleteCriterion:  (stepId, crId)  => client.delete(`/api/evaluations/steps/${stepId}/evaluation-config/criteria/${crId}/`),

  listMarkingCriteria:      (params)         => client.get('/api/evaluations/marking-criteria/', params),
  createMarkingCriteria:    (b)              => client.post('/api/evaluations/marking-criteria/', b),
  getMarkingCriteria:       (id)             => client.get(`/api/evaluations/marking-criteria/${id}/`),
  updateMarkingCriteria:    (id, b)          => client.patch(`/api/evaluations/marking-criteria/${id}/`, b),
  deleteMarkingCriteria:    (id)             => client.delete(`/api/evaluations/marking-criteria/${id}/`),
  listMarkingCriteriaItems: (id)             => client.get(`/api/evaluations/marking-criteria/${id}/items/`),
  addMarkingCriteriaItem:   (id, b)          => client.post(`/api/evaluations/marking-criteria/${id}/items/`, b),
  updateMarkingCriteriaItem:(id, itemId, b)  => client.patch(`/api/evaluations/marking-criteria/${id}/items/${itemId}/`, b),
  deleteMarkingCriteriaItem:(id, itemId)     => client.delete(`/api/evaluations/marking-criteria/${id}/items/${itemId}/`),

  submissionFeedback: (subId) => client.get(`/api/evaluations/${subId}/feedback/`),
}

export const documents = {
  forSubmission: (submissionId, params) => client.get(`/api/documents/submissions/${submissionId}/documents/`, params),
  downloadBlob: (documentId, { inline = false } = {}) =>
    client.getBlob(`/api/documents/${documentId}/download/`, inline ? { disposition: 'inline' } : undefined),
  get: (documentId) => client.get(`/api/documents/${documentId}/`),
}

export const operations = {
  dashboard:   () => client.get('/api/operations/dashboard/'),
  bottlenecks: () => client.get('/api/operations/bottlenecks/'),
  throughput:  () => client.get('/api/operations/workflow-throughput/'),
}

export const reports = {
  dashboard:   (params) => client.get('/api/reports/dashboard/', params),
  submissions: (params) => client.get('/api/reports/submissions/', params),
  judging:     (params) => client.get('/api/reports/judging/', params),
  turnaround:  (params) => client.get('/api/reports/turnaround/', params),
}

export const analytics = {
  bottlenecks:         ()       => client.get('/api/analytics/bottlenecks/'),
  reviewerPerformance: ()       => client.get('/api/analytics/reviewer-performance/'),
  programPipeline:     (progId) => client.get(`/api/analytics/programs/${progId}/pipeline/`),
  programSummary:      (progId) => client.get(`/api/analytics/programs/${progId}/summary/`),
  formResponses:       (progId, params) => client.get(`/api/analytics/programs/${progId}/form-responses/`, params),
  // B7 (R-35): one filter row {from, to, program, sector, district, channel} for every call. dashboard.view.
  kpis:          (filters)           => client.get('/api/analytics/kpis/', filters),
  series:        (filters, interval) => client.get('/api/analytics/submissions-series/', { ...filters, interval }),
  pipeline:      (filters)           => client.get('/api/analytics/pipeline/', filters),
  funnel:        (filters)           => client.get('/api/analytics/funnel/', filters),
  sources:       (filters)           => client.get('/api/analytics/sources/', filters),
  sectors:       (filters)           => client.get('/api/analytics/sectors/', filters),
  inclusion:     (filters)           => client.get('/api/analytics/inclusion/', filters),
  // Exports need reports.export. The download needs the sign-in, so it is fetched as a blob, not opened as a link.
  createExport:  (body)              => client.post('/api/analytics/exports/', body),
  exportStatus:  (id)                => client.get(`/api/analytics/exports/${id}/`),
  downloadExport: (id)               => client.getBlob(`/api/analytics/exports/${id}/download/`),
}

export const audit = {
  logs:        (params) => client.get('/api/audit/logs/', params),
  submissions: (id)     => client.get(`/api/audit/submissions/${id}/audit/`),
  assignments: (params) => client.get('/api/audit/assignments/', params),
  evaluations: (params) => client.get('/api/audit/evaluations/', params),
  list:        (params) => client.get('/api/audit/logs/', params),
}

export const users = {
  list: (params) => client.get('/api/auth/users/', params),
  updateRole: (id, body) => client.patch(`/api/auth/users/${id}/role/`, body),
  resendVerification: (id, body) => client.post(`/api/auth/users/${id}/resend-verification/`, body),
}

export const profile = {
  get:    ()     => client.get('/api/profile/'),
  update: (body) => client.patch('/api/profile/', body),
}

export const tracking = {
  get: (ref) => client.get(`/api/track/${ref}/`),
}

export const notifications = {
  list:        (params) => client.get('/api/notifications/', params),
  unreadCount: ()       => client.get('/api/notifications/unread-count/'),
  markRead:    (id)     => client.post(`/api/notifications/${id}/mark-read/`),
  markAllRead: ()       => client.post('/api/notifications/mark-read/', { mark_all: true }),
}

export const workflows = {
  list:        (params) => client.get('/api/workflow-definitions/', params),
  get:         (id)     => client.get(`/api/workflow-definitions/${id}/`),
  create:      (body)   => client.post('/api/workflow-definitions/', body),
  update:      (id, b)  => client.patch(`/api/workflow-definitions/${id}/`, b),
  delete:      (id)     => client.delete(`/api/workflow-definitions/${id}/`),
  activate:    (id)     => client.post(`/api/workflow-definitions/${id}/activate/`),
  publish:     (id)     => client.post(`/api/workflow-definitions/${id}/publish/`),
  archive:     (id)     => client.post(`/api/workflow-definitions/${id}/archive/`),
  clone:       (id)     => client.post(`/api/workflow-definitions/${id}/clone/`),
  validate:    (id)     => client.post(`/api/workflow-definitions/${id}/validate/`),
  steps:       (id)     => client.get(`/api/workflow-definitions/${id}/steps/`),
  createStep:  (id, b)  => client.post(`/api/workflow-definitions/${id}/steps/`, b),
  nodes:       (id)     => client.get(`/api/workflow-definitions/${id}/nodes/`),
  createNode:  (id, b)  => client.post(`/api/workflow-definitions/${id}/nodes/`, b),
  transitions:      (id)     => client.get(`/api/workflow-definitions/${id}/transitions/`),
  createTransition: (id, b)  => client.post(`/api/workflow-definitions/${id}/transitions/`, b),
  rules:       (id)     => client.get(`/api/workflow-definitions/${id}/rules/`),
  createRule:  (id, b)  => client.post(`/api/workflow-definitions/${id}/rules/`, b),
}

export const workflowSteps = {
  get:    (id)    => client.get(`/api/workflow-steps/${id}/`),
  update: (id, b) => client.patch(`/api/workflow-steps/${id}/`, b),
  delete: (id)    => client.delete(`/api/workflow-steps/${id}/`),
}

export const workflowNodes = {
  get:                  (id)      => client.get(`/api/workflow-nodes/${id}/`),
  update:               (id, b)   => client.patch(`/api/workflow-nodes/${id}/`, b),
  delete:               (id)      => client.delete(`/api/workflow-nodes/${id}/`),
  bindForm:             (id, b)   => client.post(`/api/workflow-nodes/${id}/bind-form/`, b),
  bindAssignmentPolicy: (id, b)   => client.post(`/api/workflow-nodes/${id}/bind-assignment-policy/`, b),
  actions:              (nodeId)  => client.get(`/api/workflow-nodes/${nodeId}/actions/`),
  createAction:         (nodeId, b) => client.post(`/api/workflow-nodes/${nodeId}/actions/`, b),
}

export const workflowTransitions = {
  get:    (id)    => client.get(`/api/workflow-transitions/${id}/`),
  update: (id, b) => client.patch(`/api/workflow-transitions/${id}/`, b),
  delete: (id)    => client.delete(`/api/workflow-transitions/${id}/`),
}

export const workflowNodeActions = {
  get:    (id)    => client.get(`/api/workflow-node-actions/${id}/`),
  update: (id, b) => client.patch(`/api/workflow-node-actions/${id}/`, b),
  delete: (id)    => client.delete(`/api/workflow-node-actions/${id}/`),
}

export const assignmentPolicies = {
  list:   (params) => client.get('/api/assignment-policies/', params),
  get:    (id)     => client.get(`/api/assignment-policies/${id}/`),
  create: (body)   => client.post('/api/assignment-policies/', body),
  update: (id, b)  => client.patch(`/api/assignment-policies/${id}/`, b),
  delete: (id)     => client.delete(`/api/assignment-policies/${id}/`),
}

export const tasks = {
  claim:    (id)    => client.post(`/api/tasks/${id}/claim/`),
  complete: (id, b) => client.post(`/api/tasks/${id}/complete/`, b),
  reassign: (id, b) => client.post(`/api/tasks/${id}/reassign/`, b),
}

export const assignmentInstances = {
  list:     (params) => client.get('/api/assignment-instances/', params),
  get:      (id)     => client.get(`/api/assignment-instances/${id}/`),
  claim:    (id)     => client.post(`/api/assignment-instances/${id}/claim/`),
  accept:   (id)     => client.post(`/api/assignment-instances/${id}/accept/`),
  complete: (id, b)  => client.post(`/api/assignment-instances/${id}/complete/`, b),
  decline:  (id, b)  => client.post(`/api/assignment-instances/${id}/decline/`, b),
  cancel:   (id, b)  => client.post(`/api/assignment-instances/${id}/cancel/`, b),
  reassign: (id, b)  => client.post(`/api/assignment-instances/${id}/reassign/`, b),
}

export const content = {
  list:            (params) => client.get('/api/content/news/', params),
  get:             (id)     => client.get(`/api/content/news/${id}/`),
  create:          (body)   => client.post('/api/content/news/', body),
  update:          (id, b)  => client.patch(`/api/content/news/${id}/`, b),
  delete:          (id)     => client.delete(`/api/content/news/${id}/`),
  highlights:      ()       => client.get('/api/content/news/highlights/'),

  hackathons:      (params) => client.get('/api/content/hackathons/', params),
  getHackathon:    (id)     => client.get(`/api/content/hackathons/${id}/`),
  createHackathon: (body)   => client.post('/api/content/hackathons/', body),
  updateHackathon: (id, b)  => client.patch(`/api/content/hackathons/${id}/`, b),
  deleteHackathon: (id)     => client.delete(`/api/content/hackathons/${id}/`),

  uploadMedia:     (body)   => client.post('/api/content/media/', body),
  deleteMedia:     (id)     => client.delete(`/api/content/media/${id}/`),

  getSiteSettings: ()       => client.get('/api/content/site-settings/'),
  updateSiteSettings: (body) => client.patch('/api/content/site-settings/', body),

  winners:         (params) => client.get('/api/content/winners/', params),
  getWinner:       (id)     => client.get(`/api/content/winners/${id}/`),
  createWinner:    (body)   => client.post('/api/content/winners/', body),
  updateWinner:    (id, b)  => client.patch(`/api/content/winners/${id}/`, b),
  deleteWinner:    (id)     => client.delete(`/api/content/winners/${id}/`),

  leadership:         (params) => client.get('/api/content/leadership/', params),
  getLeadershipCard:  (id)     => client.get(`/api/content/leadership/${id}/`),
  createLeadership:   (body)   => client.post('/api/content/leadership/', body),
  updateLeadership:   (id, b)  => client.patch(`/api/content/leadership/${id}/`, b),
  deleteLeadership:   (id)     => client.delete(`/api/content/leadership/${id}/`),
  reorderLeadership:  (body)   => client.post('/api/content/leadership/reorder/', body),
}

export const support = {
  listFaqs:   ()       => client.get('/api/support/admin/faqs/'),
  getFaq:     (id)     => client.get(`/api/support/admin/faqs/${id}/`),
  createFaq:  (body)   => client.post('/api/support/admin/faqs/', body),
  updateFaq:  (id, b)  => client.patch(`/api/support/admin/faqs/${id}/`, b),
  deleteFaq:  (id)     => client.delete(`/api/support/admin/faqs/${id}/`),
  reorderFaqs:(body)   => client.post('/api/support/admin/faqs/reorder/', body),
}

export const workflowInstances = {
  list:    (params) => client.get('/api/workflow-instances/', params),
  get:     (id)     => client.get(`/api/workflow-instances/${id}/`),
  history: (id)     => client.get(`/api/workflow-instances/${id}/history/`),
  start:   (b)      => client.post('/api/workflow-instances/start/', b),
  action:  (id, b)  => client.post(`/api/workflow-instances/${id}/actions/`, b),
  pause:   (id)     => client.post(`/api/workflow-instances/${id}/pause/`),
  resume:  (id)     => client.post(`/api/workflow-instances/${id}/resume/`),
  cancel:  (id)     => client.post(`/api/workflow-instances/${id}/cancel/`),
}

export const platform = {
  features:        ()            => client.get('/api/platform/features/'),
  setFeature:      (key, body)   => client.patch(`/api/platform/features/${key}/`, body),
  providers:       (kind)        => client.get('/api/platform/providers/', { kind }),
  runtime:         ()            => client.get('/api/platform/integrations/runtime/'),
  integrations:    (kind)        => client.get('/api/platform/integrations/', { kind }),
  integration:     (id)          => client.get(`/api/platform/integrations/${id}/`),
  createIntegration: (body)      => client.post('/api/platform/integrations/', body),
  updateIntegration: (id, body)  => client.patch(`/api/platform/integrations/${id}/`, body),
  deleteIntegration: (id)        => client.delete(`/api/platform/integrations/${id}/`),
  testIntegration:   (id, body)  => client.post(`/api/platform/integrations/${id}/test/`, body ?? {}),
  activate:          (id)        => client.post(`/api/platform/integrations/${id}/activate/`, {}),
  deactivate:        (id)        => client.post(`/api/platform/integrations/${id}/deactivate/`, {}),
  history:           (id)        => client.get(`/api/platform/integrations/${id}/history/`),
  startSsoTrial:     (id)        => client.post(`/api/platform/integrations/${id}/sso-trial/start/`, {}),
  // U7: public switches (the console reads demo_logins for the Test accounts banner).
  publicConfig:      ()          => client.get('/api/platform/public-config/'),
  // U7: the one second step after phone or email: code or password (settings.manage).
  signInSettings:    ()          => client.get('/api/auth/settings/sign-in/'),
  setSignInSettings: (body)      => client.patch('/api/auth/settings/sign-in/', body),
}

// Sectors and districts (public lists), for filter rows. Names arrive in the asked language.
export const reference = {
  sectors:   (lang) => client.get('/api/reference/sectors/', { lang }),
  districts: (lang) => client.get('/api/reference/districts/', { lang }),
}
