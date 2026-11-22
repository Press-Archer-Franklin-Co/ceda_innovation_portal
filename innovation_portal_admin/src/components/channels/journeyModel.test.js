import { describe, expect, it } from 'vitest'
import { connect, defaultsFor, moveAfter, newKey, newNode, portsOf, runOrder, toPayload, typeMap, unlinkTarget, ussdScreenText, variablesOf } from './journeyModel'

// A cut-down copy of GET /api/channels/node-types/: enough for the helpers.
const types = typeMap([
  { type: 'menu', next: false, text: { label: 'Text' }, fields: [{ name: 'options', kind: 'options', default: [{ label: { en: '', tn: '' }, next: '' }] }, { name: 'variable', kind: 'variable' }] },
  { type: 'message', next: true, ends_when: 'end', text: { label: 'Text' }, fields: [{ name: 'end', kind: 'boolean', default: false }] },
  { type: 'question', next: true, text: { label: 'Question' }, fields: [{ name: 'answer_type', kind: 'select', default: 'text' }, { name: 'variable', kind: 'variable' }] },
  { type: 'condition', next: false, text: null, fields: [{ name: 'true_next', kind: 'node' }, { name: 'false_next', kind: 'node' }] },
  { type: 'end', next: false, text: { label: 'Text' }, fields: [] },
  { type: 'ask_file', next: true, text: { label: 'Text' }, fields: [{ name: 'if_skipped', kind: 'node' }] }, // a type added later
])

const menu = {
  key: 'main', type: 'menu', text: { en: 'CEDA Innovation', tn: 'CEDA Innovation' }, next: '',
  settings: { options: [{ label: { en: 'Submit an idea', tn: 'Romela kakanyo' }, next: 'q' }, { label: { en: 'Talk to us', tn: 'Bua le rona' }, next: '' }] },
}
const question = { key: 'q', type: 'question', text: { en: 'Idea name?' }, settings: { variable: 'title' }, next: 'bye' }
const bye = { key: 'bye', type: 'end', text: { en: 'Thanks' }, settings: {}, next: '' }

describe('journey model, driven by the API node types', () => {
  it('gives ports from the type: options, node fields and next', () => {
    expect(portsOf(menu, types).map((p) => [p.id, p.number, p.target])).toEqual([['options:0', 1, 'q'], ['options:1', 2, '']])
    expect(portsOf(question, types).map((p) => p.id)).toEqual(['next'])
    expect(portsOf({ type: 'condition', settings: { true_next: 'a' } }, types).map((p) => [p.id, p.target])).toEqual([['true_next', 'a'], ['false_next', '']])
    expect(portsOf({ type: 'message', settings: { end: true } }, types)).toEqual([])
    expect(portsOf({ type: 'ask_file', settings: {} }, types).map((p) => p.id)).toEqual(['if_skipped', 'next'])
  })

  it('links and unlinks ports without touching the others', () => {
    const linked = connect(menu, 'options:1', 'bye')
    expect(linked.settings.options[1].next).toBe('bye')
    expect(menu.settings.options[1].next).toBe('')
    expect(connect({ type: 'condition', settings: {} }, 'false_next', 'b').settings.false_next).toBe('b')
    expect(connect(question, 'next', 'x').next).toBe('x')
    expect(unlinkTarget(menu, 'q', types).settings.options[0].next).toBe('')
  })

  it('starts a new step with the defaults the API gives', () => {
    expect(defaultsFor('question', types)).toEqual({ answer_type: 'text' })
    expect(newNode('menu', [], types).settings.options).toHaveLength(1)
    expect(newKey('save_draft', [{ key: 'save-draft-1' }])).toBe('save-draft-2')
  })

  it('orders steps the way the journey runs, keeping loose steps at the end', () => {
    const loose = { key: 'loose', type: 'end', text: {}, settings: {}, next: '' }
    expect(runOrder([bye, loose, question, menu], 'main', types).map((n) => n.key)).toEqual(['main', 'q', 'bye', 'loose'])
  })

  it('moves a WhatsApp block and keeps the chain joined', () => {
    const a = { key: 'a', type: 'message', settings: {}, next: 'b' }
    const b = { key: 'b', type: 'message', settings: {}, next: 'c' }
    const c = { key: 'c', type: 'message', settings: {}, next: '' }
    const moved = moveAfter([a, b, c], 'a', 'b', 'a')
    expect(moved.startKey).toBe('b')
    expect(Object.fromEntries(moved.nodes.map((n) => [n.key, n.next]))).toEqual({ a: 'c', b: 'a', c: '' })
    const first = moveAfter([a, b, c], 'c', '', 'a')
    expect(first.startKey).toBe('c')
    expect(Object.fromEntries(first.nodes.map((n) => [n.key, n.next]))).toEqual({ a: 'b', b: '', c: 'a' })
  })

  it('counts the USSD screen per language and lists saved answers', () => {
    expect(ussdScreenText(menu, 'tn', types)).toBe('CEDA Innovation\n1. Romela kakanyo\n2. Bua le rona')
    expect(variablesOf([menu, question], types)).toEqual(['draft_reference', 'title'])
    expect(Object.keys(toPayload([{ ...menu, extra: 1 }])[0]).sort()).toEqual(['key', 'next', 'position', 'settings', 'text', 'title', 'type'])
  })
})
