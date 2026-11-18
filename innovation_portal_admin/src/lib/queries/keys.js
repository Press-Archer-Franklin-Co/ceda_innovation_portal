export const qk = {
  programs:      (params) => ['programs', params ?? {}],
  program:       (id)     => ['programs', id],
  programPhases: (id)     => ['programs', id, 'phases'],
  programStats:  (id)     => ['programs', id, 'stats'],

  submissions:      (params) => ['submissions', params ?? {}],
  submission:       (id)     => ['submissions', id],
  submissionNotes:  (id)     => ['submissions', id, 'notes'],
  submissionFiles:  (id)     => ['submissions', id, 'files'],
  submissionTimeline:(id)    => ['submissions', id, 'timeline'],
  submissionSummary:(params) => ['submissions', 'summary', params ?? {}],

  tasks:      (params) => ['tasks', params ?? {}],
  task:       (id)     => ['tasks', id],
  taskQueue:  (params) => ['tasks', 'queue', params ?? {}],
  taskLogs:   (id)     => ['tasks', id, 'logs'],

  evaluations:      (params) => ['evaluations', params ?? {}],
  evaluation:       (id)     => ['evaluations', id],
  myEvaluations:    (params) => ['evaluations', 'mine', params ?? {}],
  criteria:         (programId) => ['criteria', programId],

  analytics:   () => ['analytics'],
  auditLogs:   (params) => ['audit', 'logs', params ?? {}],
  activity:    (params) => ['audit', 'activity', params ?? {}],

  users:       (params) => ['users', params ?? {}],
  memberships: (params) => ['memberships', params ?? {}],
}
