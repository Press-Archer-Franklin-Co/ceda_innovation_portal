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
