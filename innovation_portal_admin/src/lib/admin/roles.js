// S2 Roles & permissions: pure helpers for /api/admin/roles/ and /api/admin/capabilities/ (R-31).

/** { roleId: [capability keys] } from GET /api/admin/roles/. */
export function matrixFrom(roles = []) {
  return Object.fromEntries(roles.map((r) => [String(r.id), [...(r.capabilities ?? [])].sort()]))
}

export function toggleCell(matrix, roleId, key, on) {
  const held = new Set(matrix[roleId] ?? [])
  if (on) held.add(key)
  else held.delete(key)
  return { ...matrix, [roleId]: [...held].sort() }
}

/** What changed per role: [{ roleId, added: [keys], removed: [keys] }], only roles that changed. */
export function matrixChanges(before, after) {
  return Object.keys(after).map((roleId) => {
    const was = new Set(before[roleId] ?? [])
    const now = new Set(after[roleId] ?? [])
    return { roleId, added: [...now].filter((k) => !was.has(k)), removed: [...was].filter((k) => !now.has(k)) }
  }).filter((c) => c.added.length || c.removed.length)
}

/** Plain sentences for the confirm dialog, e.g. "Innovation Manager will now be able to: Edit website content." */
export function describeChanges(changes, roleName, capLabel, t) {
  return changes.flatMap((c) => [
    ...(c.added.length ? [t('roles.willAdd', { role: roleName(c.roleId), list: c.added.map(capLabel).join(', ') })] : []),
    ...(c.removed.length ? [t('roles.willRemove', { role: roleName(c.roleId), list: c.removed.map(capLabel).join(', ') })] : []),
  ])
}

/** Locks from GET /roles/{id}/capabilities/, as { roleId: { key: reason } }. */
export function locksFrom(details = []) {
  return Object.fromEntries(details.filter(Boolean).map((d) => [String(d.role?.id ?? d.role), Object.fromEntries((d.capabilities ?? []).filter((c) => c.locked).map((c) => [c.key, c.lock_reason || '']))]))
}

/** Capabilities in their groups, in the catalogue's group order. */
export function groupCapabilities(catalogue) {
  const groups = catalogue?.groups ?? []
  const caps = catalogue?.capabilities ?? []
  return groups.map((g) => ({ key: g, items: caps.filter((c) => c.group === g) })).filter((g) => g.items.length)
}

export const pickText = (value, lang) => (value && typeof value === 'object' ? (value[lang]?.trim() ? value[lang] : value.en ?? '') : value ?? '')

/**
 * 3.24 (Figma 111:1585): permissions as rows in plain words with View / Edit / Approve columns. Each cell is one
 * capability from the catalogue (S1), so nothing here grants more than the API checks. A capability the catalogue
 * adds later, and this list does not name, joins its group as an Edit cell under its own label.
 */
export const PERMISSION_ROWS = [
  { group: 'overview', key: 'dashboard', view: 'dashboard.view' },
  { group: 'overview', key: 'reports', view: 'analytics.view', edit: 'reports.export' },
  { group: 'ideas', key: 'search', view: 'entries.search' },
  { group: 'ideas', key: 'review', edit: 'entries.review' },
  { group: 'ideas', key: 'assign', edit: 'entries.assign' },
  { group: 'ideas', key: 'score', edit: 'entries.score' },
  { group: 'ideas', key: 'inbox', edit: 'conversations.reply' },
  { group: 'challenges', key: 'challenges', edit: 'challenges.manage' },
  { group: 'challenges', key: 'forms', edit: 'forms.manage' },
  { group: 'challenges', key: 'criteria', edit: 'criteria.manage' },
  { group: 'website', key: 'content', edit: 'content.edit' },
  { group: 'website', key: 'publish', approve: 'content.approve' },
  { group: 'administration', key: 'users', edit: 'users.manage' },
  { group: 'administration', key: 'settings', edit: 'settings.manage' },
  { group: 'administration', key: 'channels', edit: 'channels.manage' },
  { group: 'administration', key: 'audit', view: 'audit.view' },
]
export const PERMISSION_COLUMNS = ['view', 'edit', 'approve']

/** [{ key: group, rows: [{ key, label?, view?, edit?, approve? }] }] for the catalogue, in its group order. */
export function permissionGroups(catalogue) {
  const caps = catalogue?.capabilities ?? []
  const known = new Set(caps.map((c) => c.key))
  const named = new Set(PERMISSION_ROWS.flatMap((r) => PERMISSION_COLUMNS.map((col) => r[col]).filter(Boolean)))
  const rows = PERMISSION_ROWS
    .map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !PERMISSION_COLUMNS.includes(k) || known.has(v))))
    .filter((r) => PERMISSION_COLUMNS.some((col) => r[col]))
  const extra = caps.filter((c) => !named.has(c.key)).map((c) => ({ group: c.group, key: c.key, label: c.label, edit: c.key }))
  const all = [...rows, ...extra]
  return (catalogue?.groups ?? []).map((g) => ({ key: g, rows: all.filter((r) => r.group === g) })).filter((g) => g.rows.length)
}

/** The capabilities a copy of a role may carry: not the ones only administrators may hold. */
export function copyableCapabilities(role, catalogue) {
  const locked = new Set((catalogue?.capabilities ?? []).filter((c) => (c.locked_to ?? []).length).map((c) => c.key))
  return (role?.capabilities ?? []).filter((k) => !locked.has(k))
}
