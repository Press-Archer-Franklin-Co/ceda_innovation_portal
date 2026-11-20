// Role names for SHOWING and CHOOSING a role (the "act as" picker in My work, whose queue the API filters by
// role). Never use these to decide what someone may see or do: ask can('capability') instead (S1).
export const STAFF_WORKER_ROLES = [
  'judge', 'reviewer',
  'innovation_officer', 'innovation_manager', 'innovation_analyst', 'staff_member', 'specialist', 'exo', 'management_viewer',
  'mentor',
  'administrator', 'admin',
]
