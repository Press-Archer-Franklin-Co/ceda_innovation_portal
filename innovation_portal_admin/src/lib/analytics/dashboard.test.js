import { describe, expect, it } from 'vitest'
import {
  readFilters, withFilter, withoutFilters, changeWords, decisionTone, periodEnd,
  pipelineRows, funnelRows, channelRows, inclusionShares, exportFileName,
} from './dashboard'

describe('filters in the URL', () => {
  it('keeps known filters and drops bad dates, unknown channels and a to before from', () => {
    const p = new URLSearchParams('program=agri&from=2026-11-01&to=2026-10-01&channel=fax&sector=&tab=x&district=gaborone')
    expect(readFilters(p)).toEqual({ program: 'agri', from: '2026-11-01', district: 'gaborone' })
    expect(readFilters(new URLSearchParams('from=1 Nov'))).toEqual({})
  })

  it('changes one filter and keeps other params', () => {
    const p = new URLSearchParams('tab=answers&sector=agri')
    expect(withFilter(p, 'channel', 'web').toString()).toBe('tab=answers&sector=agri&channel=web')
    expect(withFilter(p, 'sector', '').toString()).toBe('tab=answers')
    expect(withoutFilters(new URLSearchParams('tab=a&from=2026-01-01&channel=web')).toString()).toBe('tab=a')
  })
})

describe('words for numbers', () => {
  it('says up, down, same, or nothing to compare', () => {
    expect(changeWords(12.5)).toEqual({ tone: 'up', key: 'dash.kpi.up', value: 12.5 })
    expect(changeWords(-4)).toEqual({ tone: 'down', key: 'dash.kpi.down', value: 4 })
    expect(changeWords(0).key).toBe('dash.kpi.same')
    expect(changeWords(null).key).toBe('dash.kpi.noCompare')
  })

  it('compares days to a decision with the target', () => {
    expect(decisionTone(null, 10)).toBe('none')
    expect(decisionTone(8.5, 10)).toBe('good')
    expect(decisionTone(12, 10)).toBe('late')
  })

  it('finds the end of a week and of a month', () => {
    expect(periodEnd('2026-11-02', 'week').getDate()).toBe(8)
    expect(periodEnd('2026-02-01', 'month').getDate()).toBe(28)
  })
})

describe('shaping API answers', () => {
  it('orders stages, flags the bottleneck and drops unknown stages', () => {
    const rows = pipelineRows({
      bottleneck: 'review',
      stages: [
        { code: 'review', count: 5, waiting_over_7_days: 3 },
        { code: 'received', count: 2, waiting_over_7_days: 0 },
        { code: 'mystery', count: 9, waiting_over_7_days: 9 },
      ],
    })
    expect(rows.map((r) => r.code)).toEqual(['received', 'review'])
    expect(rows[1]).toEqual({ code: 'review', count: 5, waiting: 3, bottleneck: true })
  })

  it('leaves "funded" out of the funnel until it is tracked', () => {
    const funnel = { submitted: 40, passed_check: 30, reviewed: 20, panel: 8, supported: 3, funded: null, funded_tracked: false }
    const rows = funnelRows(funnel)
    expect(rows.map((r) => r.step)).toEqual(['submitted', 'passed_check', 'reviewed', 'panel', 'supported'])
    expect(rows[1].pct).toBe(75)
    expect(funnelRows({ ...funnel, funded: 1, funded_tracked: true }).at(-1)).toEqual({ step: 'funded', count: 1, pct: 2.5 })
    expect(funnelRows({ submitted: 0, passed_check: 0 })[1].pct).toBe(0)
  })

  it('keeps channels in one order and drops unknown ones', () => {
    const rows = channelRows({ channels: [{ channel: 'ussd', count: 1, pct: 10 }, { channel: 'web', count: 9, pct: 90 }, { channel: 'pigeon', count: 1 }] })
    expect(rows.map((r) => r.channel)).toEqual(['web', 'ussd'])
  })

  it('works out youth, women and rural shares from the people we know about', () => {
    const s = inclusionShares({
      age: { youth_18_35: 6, '36_and_over': 3, under_18: 1, unknown: 5 },
      gender: { women: 4, men: 4, other_or_unknown: 0, unknown: 7 },
      place: { rural: 0, urban: 0, unknown: 15 },
    })
    expect(s.youth).toEqual({ pct: 60, count: 6, known: 10, unknown: 5 })
    expect(s.women.pct).toBe(50)
    expect(s.rural.pct).toBeNull()
  })

  it('names export files by report, day and format', () => {
    expect(exportFileName('funnel', 'csv', new Date('2026-11-20T10:00:00Z'))).toBe('ceda-funnel-2026-11-20.csv')
  })
})
