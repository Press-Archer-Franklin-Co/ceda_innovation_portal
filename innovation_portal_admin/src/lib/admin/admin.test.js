import { describe, expect, it } from 'vitest'
import { describeChanges, groupCapabilities, locksFrom, matrixChanges, matrixFrom, toggleCell } from './roles'
import { approverFrom, approverValue, flowProblems, flowSentence, fromFlow, moveStep, newStep, toFlowPayload } from './approvals'

const t = (key, vars = {}) => `${key}${Object.keys(vars).length ? JSON.stringify(vars) : ''}`

describe('roles matrix', () => {
  const roles = [{ id: 1, capabilities: ['content.approve'] }, { id: 2, capabilities: ['content.edit', 'forms.manage'] }]
  it('lists only what changed', () => {
    const before = matrixFrom(roles)
    let after = toggleCell(before, '1', 'content.edit', true)
    after = toggleCell(after, '2', 'forms.manage', false)
    expect(matrixChanges(before, after)).toEqual([{ roleId: '1', added: ['content.edit'], removed: [] }, { roleId: '2', added: [], removed: ['forms.manage'] }])
    expect(matrixChanges(before, toggleCell(toggleCell(before, '1', 'x', true), '1', 'x', false))).toEqual([])
  })
  it('says what will change in plain words', () => {
    const lines = describeChanges([{ roleId: '1', added: ['content.edit'], removed: [] }], () => 'Managers', () => 'Edit website content', (k, v) => `${k}:${v.role}:${v.list}`)
    expect(lines).toEqual(['roles.willAdd:Managers:Edit website content'])
  })
  it('reads locks and groups', () => {
    expect(locksFrom([{ role: { id: 3 }, capabilities: [{ key: 'users.manage', locked: true, lock_reason: 'Always with Administrator' }, { key: 'x', locked: false }] }])).toEqual({ 3: { 'users.manage': 'Always with Administrator' } })
    expect(groupCapabilities({ groups: ['website', 'ideas'], capabilities: [{ key: 'a', group: 'ideas' }, { key: 'b', group: 'website' }] }).map((g) => g.key)).toEqual(['website', 'ideas'])
  })
})

describe('approval steps', () => {
  const flow = { approvers_can_approve_own_work: true, steps: [
    { id: 's2', order: 1, name: 'Setswana', approver: { role: 'setswana_reviewer', role_name: 'Setswana reviewer' }, approvals_needed: 1, language: 'tn' },
    { id: 's1', order: 0, name: 'English', approver: { capability: 'content.approve' }, approvals_needed: 1, language: 'en' },
  ] }
  it('keeps steps in order and sends what the API takes', () => {
    const f = fromFlow(flow)
    expect(f.steps.map((s) => s.id)).toEqual(['s1', 's2'])
    const payload = toFlowPayload({ ...f, steps: [...f.steps, { ...newStep('en'), approver: { role: 'board' }, approvals_needed: '2' }] })
    expect(payload.steps).toEqual([
      { id: 's1', order: 0, name: 'English', approver: { capability: 'content.approve' }, approvals_needed: 1, language: 'en' },
      { id: 's2', order: 1, name: 'Setswana', approver: { role: 'setswana_reviewer' }, approvals_needed: 1, language: 'tn' },
      { order: 2, name: '', approver: { role: 'board' }, approvals_needed: 2, language: 'en' },
    ])
  })
  it('needs a step that covers English', () => {
    expect(flowProblems({ steps: [] })).toEqual([{ key: 'appr.needStep' }])
    expect(flowProblems({ steps: [{ ...newStep('tn') }] })).toEqual([{ key: 'appr.needEnglish' }])
    expect(flowProblems(fromFlow(flow))).toEqual([])
  })
  it('moves steps and maps the approver select', () => {
    const steps = fromFlow(flow).steps
    expect(moveStep(steps, 0, 1).map((s) => s.id)).toEqual(['s2', 's1'])
    expect(moveStep(steps, 0, -1)).toBe(steps)
    expect(approverValue({ role: 'board' })).toBe('role:board')
    expect(approverFrom('cap:content.approve')).toEqual({ capability: 'content.approve' })
  })
  it('writes the plain sentence', () => {
    const s = flowSentence(fromFlow(flow), (a) => a.role_name ?? 'Approvers', t)
    expect(s).toContain('appr.sentenceEnglish')
    expect(s).toContain('appr.sentenceSetswana')
    expect(s).toContain('Setswana reviewer')
    expect(s).toContain('appr.sentenceOwnYes')
  })
})
