import { describe, expect, test } from 'vitest'
import { STATUS_WORDS, statusWord } from './status'
import en from '../i18n/en'
import tn from '../i18n/tn'

// Every API value in the ceda-ui skill's status table (section 6), with the word and tone it must show.
const TABLE = [
  ['draft', 'Draft', 'neutral'],
  ['submitted', 'Submitted', 'blue'],
  ...['screening', 'review', 'under_review', 'in_review', 'judging_review', 'assigned_to_judges', 'under_judging', 'in_evaluation']
    .map((v) => [v, 'In review', 'blue']),
  ...['requires_more_information', 'returned', 'returned_for_correction'].map((v) => [v, 'Needs your input', 'amber']),
  ...['shortlisted', 'finalist', 'selected_for_hackathon'].map((v) => [v, 'Shortlisted', 'orange']),
  ['approved', 'Approved', 'green'],
  ['evaluated', 'Approved', 'green'],
  ['winner', 'Winner', 'green'],
  ['rejected', 'Not taken forward', 'red'],
  ['screened_out', 'Not taken forward', 'red'],
  ['open', 'Open', 'green'],
  ['closed', 'Closed', 'neutral'],
  ['upcoming', 'Upcoming', 'blue'],
  ['published', 'Published', 'green'],
  ['live', 'Published', 'green'],
  ['scheduled', 'Scheduled', 'blue'],
  ['pending_approval', 'Waiting for approval', 'amber'],
  ['archived', 'Archived', 'neutral'],
  ['assigned', 'Assigned', 'blue'],
  ['claimed', 'In progress', 'blue'],
  ['in_progress', 'In progress', 'blue'],
  ['completed', 'Done', 'green'],
]

describe('statusWord', () => {
  test.each(TABLE)('%s shows "%s" (%s)', (value: string, word: string, tone: string) => {
    const s = statusWord(value)
    expect((en as Record<string, string>)[s.labelKey]).toBe(word)
    expect(s.tone).toBe(tone)
  })

  test('winner has the gold dot', () => {
    expect(statusWord('winner').dot).toBe('bg-yellow')
  })

  test.each([undefined, null, '', 'something_new', 42, true])('unknown value %s shows "Not known"', (value) => {
    const s = statusWord(value)
    expect(s.key).toBe('unknown')
    expect((en as Record<string, string>)[s.labelKey]).toBe('Not known')
    expect(s.tone).toBe('unknown')
  })

  test('ignores case and spaces', () => {
    expect(statusWord(' Under_Review ').key).toBe('in_review')
  })

  test('every word has English and Setswana', () => {
    for (const key of Object.keys(STATUS_WORDS)) {
      expect((en as Record<string, string>)[`status.${key}`], key).toBeTruthy()
      expect((tn as Record<string, string>)[`status.${key}`], key).toBeTruthy()
    }
  })
})
