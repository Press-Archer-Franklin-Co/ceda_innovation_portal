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

export const PERMISSION_COLUMNS = ['view', 'edit', 'approve']
export const OTHER_GROUP = 'other'
// Group names the strings files already have words for. A group the API adds brings its own (group_details).
const NAMED_GROUPS = ['overview', 'ideas', 'challenges', 'website', 'administration']

/** Which column a capability's box sits in: the API's `level`, or else its action word (dashboard.view -> view). */
export function levelOf(capability) {
  if (PERMISSION_COLUMNS.includes(capability?.level)) return capability.level
  const action = String(capability?.key ?? '').split('.').pop()
  if (['view', 'search', 'hints'].includes(action)) return 'view'
  return action === 'approve' ? 'approve' : 'edit'
}

/**
 * 3.24, compact (Nshathisi, 23 Nov): the catalogue from GET /api/admin/capabilities/ as one entry per group:
 * [{ key, label?, description?, keys: [capability keys], rows: [{ key, label, view?, edit?, approve? }] }].
 * Capabilities that share an `area` share a line; without one each has its own. No group, or a group nobody can
 * name, goes under "Other", which is always last.
 */
export function permissionGroups(catalogue) {
  const order = catalogue?.groups ?? []
  const details = catalogue?.group_details ?? {}
  const shown = (g) => order.includes(g) && (Boolean(details[g]) || NAMED_GROUPS.includes(g))
  const byGroup = new Map()
  for (const c of catalogue?.capabilities ?? []) {
    const key = shown(c.group) ? c.group : OTHER_GROUP
    if (!byGroup.has(key)) byGroup.set(key, { key, label: details[key]?.label, description: details[key]?.description, keys: [], rows: [] })
    const group = byGroup.get(key)
    const level = levelOf(c)
    const line = c.area ? group.rows.find((r) => r.area === c.area && !r[level]) : null
    if (line) line[level] = c.key
    else group.rows.push({ key: c.area ? `${c.area}:${c.key}` : c.key, area: c.area, label: c.area_label ?? c.label, [level]: c.key })
    group.keys.push(c.key)
  }
  return [...order.filter((g) => g !== OTHER_GROUP), OTHER_GROUP].map((g) => byGroup.get(g)).filter(Boolean)
}

/** One group's checkbox: how many are on, all / some / none, and which boxes it may change (not the locked ones). */
export function groupSummary(group, held = [], locks = {}) {
  const on = group.keys.filter((k) => held.includes(k)).length
  const total = group.keys.length
  return { on, total, state: on === 0 ? 'none' : on === total ? 'all' : 'some', free: group.keys.filter((k) => locks[k] == null) }
}

/** Ticking the group box: turns on everything it may change, or, when all of those are on already, turns them off. */
export function toggleGroup(group, held = [], locks = {}) {
  const { free } = groupSummary(group, held, locks)
  const next = new Set(held)
  const allOn = free.every((k) => next.has(k))
  for (const k of free) { if (allOn) next.delete(k); else next.add(k) }
  return [...next].sort()
}

/** The capabilities a copy of a role may carry: not the ones only administrators may hold. */
export function copyableCapabilities(role, catalogue) {
  const locked = new Set((catalogue?.capabilities ?? []).filter((c) => (c.locked_to ?? []).length).map((c) => c.key))
  return (role?.capabilities ?? []).filter((k) => !locked.has(k))
}
