import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/en'
import type { StringKey } from '../../i18n'
import type { HomeMessage, IdeaItem } from '../../types/innovator'
import IdeaCard from './IdeaCard'
import ShortlistedCard from './tracking/ShortlistedCard'
import { knownMessages, messageView } from './homeMessages'
import { ideaStatusWord } from './ideaStatus'

const t = (key: StringKey, vars: Record<string, string | number> = {}) =>
  Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), en[key] ?? key)
const base = { idea_id: 'i1', kind: 'submission' as const, reference: 'CEDA-IP-2026-04817', title: 'Mopane snacks', at: '2026-11-22T08:00:00Z' }

describe('2.1 home messages', () => {
  it('changes requested shows the officer, the note and Open idea', () => {
    const v = messageView({ ...base, type: 'changes_requested', note: 'Add your supplier quote.', officer: 'Kago T.', fix_by: '2026-11-28' }, t, 'en')
    expect(v.headline).toBe('An officer asked for a few changes.')
    expect(v.body).toContain('Kago T. asked for changes to Mopane snacks: "Add your supplier quote."')
    expect(v.body).toContain('Please send it back by 28 Nov')
    expect(v.cta).toEqual({ to: '/my-ideas/i1', label: 'Open idea' })
  })
  it('a question offers Reply and opens the messages', () => {
    const v = messageView({ ...base, type: 'question', officer_first_name: 'Kago', excerpt: 'Who supplies your packaging?', reply_by: '2026-11-25' }, t, 'en')
    expect(v.cta).toEqual({ to: '/my-ideas/i1#messages', label: 'Reply to Kago' })
    expect(v.body).toContain('Reply by 25 Nov')
  })
  it('a draft offers Continue into the form', () => {
    const v = messageView({ ...base, kind: 'draft', type: 'draft', percent_complete: 60 }, t, 'en')
    expect(v.headline).toBe('Continue where you left off.')
    expect(v.cta).toEqual({ to: '/my-ideas/draft/i1', label: 'Continue' })
  })
  it('shortlisted and a stage move offer View idea, in CEDA status words', () => {
    expect(messageView({ ...base, type: 'shortlisted', challenge: 'Agribusiness Value-Add' }, t, 'en').body).toBe('Mopane snacks is on the shortlist for Agribusiness Value-Add.')
    const moved = messageView({ ...base, type: 'stage_moved', status: 'under_review', stage: 'Under review' }, t, 'en')
    expect(moved.body).toBe('Mopane snacks is now: In review.')
    expect(moved.cta.label).toBe('View idea')
  })
  it('an event gives the date in Gaborone time', () => {
    const v = messageView({ ...base, type: 'event', challenge: 'Agribusiness pitch day', event_date: '2026-12-02T12:00:00Z' }, t, 'en')
    expect(v.body).toContain('14:00')
    expect(v.body).toContain('Gaborone time')
  })
  it('nothing to say, or a type this screen does not know, draws nothing', () => {
    expect(knownMessages(undefined)).toEqual([])
    expect(knownMessages([{ ...base, type: 'surprise' } as unknown as HomeMessage])).toEqual([])
  })
})

const card = (extra: Partial<IdeaItem>) => ({
  id: 'i1', kind: 'submission', channel: 'web', state: 'in_review', reference: 'CEDA-IP-2026-04817', title: 'Mopane snacks',
  sector: null, program: null, stage: 'Officer review', status: 'under_review', percent_complete: 100, last_change: '2026-11-22T08:00:00Z',
  needs_action_reason: '', reply_by: null, stages: [], submitted_at: '2026-11-18T08:00:00Z', decided_at: null, has_feedback: false, open_question: null,
  ...extra,
}) as IdeaItem
const html = (item: IdeaItem) => renderToStaticMarkup(<MemoryRouter><IdeaCard item={item} /></MemoryRouter>)

describe('2.2 idea cards', () => {
  it('the whole card opens the idea; the button stays its own target', () => {
    const out = html(card({}))
    expect(out).toContain('href="/my-ideas/i1"')
    expect(out).toContain('after:absolute after:inset-0')
    expect(out).toContain('relative z-10')
  })
  it('a draft card opens the form', () => {
    expect(html(card({ kind: 'draft', state: 'drafts', status: 'draft', percent_complete: 60 }))).toContain('href="/my-ideas/draft/i1"')
  })
  it('every status the workflows use has a CEDA word, never a raw value', () => {
    const words: Record<string, string> = {
      draft: 'Draft', submitted: 'Submitted', under_review: 'In review', screening: 'In review', returned: 'Needs your input',
      requires_more_information: 'Needs your input', shortlisted: 'Shortlisted', finalist: 'Shortlisted', approved: 'Approved',
      rejected: 'Not taken forward', screened_out: 'Not taken forward', winner: 'Winner', completed: 'Done',
    }
    for (const [status, word] of Object.entries(words)) expect(t(ideaStatusWord({ status }).key), status).toBe(word)
  })
})

describe('2.4 shortlisted card', () => {
  it('says pitch details come soon when no session is set, and never a date', () => {
    const out = renderToStaticMarkup(<ShortlistedCard session={null} />)
    expect(out).toContain('Shortlisted')
    expect(out).toContain('CEDA will share the pitch details soon.')
    expect(out).not.toMatch(/\d{2}:\d{2}/)
  })
  it('shows the session in Gaborone time with its place and instructions', () => {
    const out = renderToStaticMarkup(<ShortlistedCard session={{ starts_at: '2026-12-02T12:00:00Z', place: 'CEDA House, Gaborone', instructions: 'Bring a one-page summary.' }} />)
    expect(out).toContain('14:00')
    expect(out).toContain('Gaborone time')
    expect(out).toContain('CEDA House, Gaborone')
    expect(out).toContain('Bring a one-page summary.')
    expect(out).not.toContain('CEDA will share the pitch details soon.')
  })
})
