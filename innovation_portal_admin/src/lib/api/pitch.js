import { client } from './client'

// Per-person pitch times (Nshathisi, 23 Nov 11:13): staff give each shortlisted person their own session.
// The per-idea API is on main (PR 113). The schedule list is R-84 (backend): until it merges it answers 404.
export const pitchApi = {
  get: (programId, submissionId) => client.get(`/api/programs/${programId}/entries/${submissionId}/pitch/`),
  save: (programId, submissionId, body) => client.put(`/api/programs/${programId}/entries/${submissionId}/pitch/`, body),
  remove: (programId, submissionId) => client.delete(`/api/programs/${programId}/entries/${submissionId}/pitch/`),
  schedule: (programId, params) => client.get(`/api/programs/${programId}/pitch-schedule/`, params),
}

/** The form's starting values from a staff session payload ({place, instructions} in both languages). */
export function formFromSession(session) {
  return {
    when: session?.starts_at_local ? session.starts_at_local.slice(0, 16) : '',
    minutes: session?.duration_minutes ? String(session.duration_minutes) : '',
    format: session?.format ?? 'in_person',
    place_en: session?.place?.en ?? '',
    place_tn: session?.place?.tn ?? '',
    link: session?.meeting_link ?? '',
    text_en: session?.instructions?.en ?? '',
    text_tn: session?.instructions?.tn ?? '',
  }
}

/** PUT body. A time without a zone is read as Gaborone time by the API. */
export function bodyFromForm(f) {
  const online = f.format === 'online'
  return {
    starts_at: f.when,
    duration_minutes: f.minutes === '' ? null : Number(f.minutes),
    format: f.format,
    place: online ? { en: '', tn: '' } : { en: f.place_en.trim(), tn: f.place_tn.trim() },
    meeting_link: online ? f.link.trim() : '',
    instructions: { en: f.text_en.trim(), tn: f.text_tn.trim() },
  }
}

/** What is missing before Save: the date and time, and the place (in person) or an https link (online). */
export function formProblems(f) {
  const out = []
  if (!f.when) out.push('when')
  if (f.format === 'online' && !/^https:\/\/\S+$/.test(f.link.trim())) out.push('link')
  if (f.format !== 'online' && !f.place_en.trim()) out.push('place')
  return out
}

/** "Fri 28 Nov, 09:00" from the API's Gaborone date and time; never the device's clock. */
export function pitchWhen(session) {
  if (!session?.date) return ''
  const [y, m, d] = session.date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-BW', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
  return session.time ? `${day}, ${session.time}` : day
}

/** The time a person sees: their own, else the stage's time for everyone. */
export function shownSession(row) {
  return row?.own ?? row?.shown ?? null
}
