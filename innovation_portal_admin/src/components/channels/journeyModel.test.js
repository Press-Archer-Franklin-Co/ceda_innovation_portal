import { describe, expect, it } from 'vitest'
import { USSD_LIMIT, connect, newKey, newNode, nodeHeight, portsOf, toPayload, unlinkTarget, ussdScreenText } from './journeyModel'

const t = (key) => key

const menu = {
  key: 'main',
  type: 'menu',
  text: { en: 'CEDA Innovation', tn: 'CEDA Innovation' },
  settings: { options: [{ label: { en: 'Submit an idea', tn: 'Romela kakanyo' }, next: 'a' }, { label: { en: 'Talk to us', tn: 'Bua le rona' }, next: '' }] },
  next: '',
  position: { x: 0, y: 0 },
}

describe('journey model', () => {
  it('gives a menu one port per option, and an end step none', () => {
    expect(portsOf(menu, t).map((p) => [p.id, p.target])).toEqual([['option:0', 'a'], ['option:1', '']])
    expect(portsOf({ type: 'end', settings: {} }, t)).toEqual([])
    expect(portsOf({ type: 'message', settings: { end: true } }, t)).toEqual([])
  })

  it('links a port to a step without touching the others', () => {
    const linked = connect(menu, 'option:1', 'talk')
    expect(linked.settings.options[1].next).toBe('talk')
    expect(linked.settings.options[0].next).toBe('a')
    expect(menu.settings.options[1].next).toBe('')
    const condition = connect({ type: 'condition', settings: {} }, 'false', 'b')
    expect(condition.settings.false_next).toBe('b')
    expect(connect({ type: 'question', settings: {}, next: '' }, 'next', 'c').next).toBe('c')
  })

  it('removes every arrow to a deleted step', () => {
    const cleaned = unlinkTarget(menu, 'a', t)
    expect(cleaned.settings.options[0].next).toBe('')
  })

  it('makes unique keys and sensible new steps', () => {
    expect(newKey('menu', [{ key: 'menu-1' }])).toBe('menu-2')
    expect(newKey('save_draft', [])).toBe('save-draft-1')
    expect(newNode('menu', [], { x: 1, y: 2 }).settings.options).toHaveLength(1)
    expect(newNode('question', [], { x: 0, y: 0 }).settings.answer_type).toBe('text')
  })

  it('counts the USSD screen the way the API shows it, per language', () => {
    expect(ussdScreenText(menu, 'en')).toBe('CEDA Innovation\n1. Submit an idea\n2. Talk to us')
    expect(ussdScreenText(menu, 'tn')).toBe('CEDA Innovation\n1. Romela kakanyo\n2. Bua le rona')
    expect(ussdScreenText({ type: 'question', text: { en: 'OK?' }, settings: { answer_type: 'yes_no' } }, 'tn')).toBe('OK?\n1. Ee\n2. Nnyaa')
    expect(USSD_LIMIT).toBe(182)
  })

  it('grows a step with its ports and saves only the API fields', () => {
    expect(nodeHeight(menu, t)).toBeGreaterThan(nodeHeight({ type: 'end', settings: {} }, t))
    expect(Object.keys(toPayload([{ ...menu, extra: 1 }])[0]).sort()).toEqual(['key', 'next', 'position', 'settings', 'text', 'title', 'type'])
  })
})
