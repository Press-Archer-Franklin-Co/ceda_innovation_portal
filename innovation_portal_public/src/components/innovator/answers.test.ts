import { describe, expect, it } from 'vitest'
import { answerFiles, answerText } from './answers'
import type { SubmissionAnswer } from '../../types/innovator'

const answer = (field_type: string, value: unknown) => ({ id: 'a', field_key: 'k', field_label: 'Architecture diagram', field_type, value }) as unknown as SubmissionAnswer

describe('Track my idea answers (2.4)', () => {
  it('shows a file answer by its name, never [object Object]', () => {
    const imported = [{ mime_type: 'application/pdf', size_bytes: 1700000, original_filename: 'architecture.pdf' }]
    expect(answerText(answer('file', imported), 'Yes', 'No answer')).toBe('architecture.pdf')
    expect(answerFiles(imported)).toEqual([{ id: undefined, name: 'architecture.pdf', url: undefined }])
  })
  it('keeps the link for files uploaded through the form', () => {
    expect(answerFiles([{ id: 'f1', filename: 'plan.pdf', url: '/media/plan.pdf' }])).toEqual([{ id: 'f1', name: 'plan.pdf', url: '/media/plan.pdf' }])
  })
  it('never prints an object for other answers', () => {
    expect(answerText(answer('text', [{ a: 1 }]), 'Yes', 'No answer')).toBe('No answer')
    expect(answerText(answer('select', ['a', 'b']), 'Yes', 'No answer')).toBe('a, b')
    expect(answerText(answer('boolean', true), 'Yes', 'No answer')).toBe('Yes')
  })
})
