import { describe, expect, it } from 'vitest'
import { START_ID, buildFlow, flowProblems, strandedBy, unreachable } from './flowGraph'
import { fromJourney, toPayload, typeMap } from './journeyModel'

// The node types as GET /api/channels/node-types/ describes them (only what the diagram reads).
const node = (name) => ({ name, kind: 'node', label: name, label_tn: name })
const types = typeMap([
  { type: 'menu', next: false, fields: [{ name: 'options', kind: 'options' }] },
  { type: 'message', next: true, ends_when: 'end', fields: [] },
  { type: 'question', next: true, fields: [] },
  { type: 'form_questions', next: true, fields: [] },
  { type: 'file', next: true, fields: [] },
  { type: 'submit', next: false, fields: [node('success_next'), node('error_next')] },
  { type: 'my_ideas', next: true, fields: [node('continue_next')] },
  { type: 'handoff', next: false, fields: [] },
  { type: 'end', next: false, fields: [] },
  { type: 'condition', next: false, fields: [node('true_next'), node('false_next')] },
])
const label = (en) => ({ en, tn: en })
const words = { true_next: 'Yes', false_next: 'No', success_next: 'Sent', error_next: 'Not sent', continue_next: 'Continue this idea', main_menu: 'Main menu' }

// A three-way first menu: each answer has its own steps and its own end.
const threeWay = [
  { key: 'main', type: 'menu', text: label('CEDA'), settings: { options: [
    { label: label('Submit an idea'), next: 'form' },
    { label: label('My ideas'), next: 'ideas' },
    { label: label('Talk to us'), next: 'talk' },
  ] }, next: '' },
  { key: 'form', type: 'form_questions', text: label('Your idea'), settings: {}, next: 'photo' },
  { key: 'photo', type: 'file', text: label('A photo'), settings: {}, next: 'send' },
  { key: 'send', type: 'submit', text: {}, settings: { success_next: 'done', error_next: '' }, next: '' },
  { key: 'done', type: 'end', text: label('Thank you'), settings: {}, next: '' },
  { key: 'ideas', type: 'my_ideas', text: {}, settings: { continue_next: 'form' }, next: '' },
  { key: 'talk', type: 'handoff', text: label('Tell us'), settings: {}, next: '' },
]

const edgesFrom = (flow, key) => flow.edges.filter((e) => e.source === key)
const kindOf = (flow, id) => flow.nodes.find((n) => n.id === id)?.data.kind

describe('buildFlow', () => {
  it('draws a three-way first menu as three labelled branches, each to its own steps and end', () => {
    const flow = buildFlow(threeWay, 'main', types, { words })
    expect(edgesFrom(flow, START_ID).map((e) => e.target)).toEqual(['main'])
    const branches = edgesFrom(flow, 'main')
    expect(branches.map((e) => e.data.label)).toEqual(['1 · Submit an idea', '2 · My ideas', '3 · Talk to us'])
    expect(branches.map((e) => e.target)).toEqual(['form', 'ideas', 'talk'])
    // Submit an idea: form, photo, send; send fans out to Sent (done, then its end) and Not sent (an end).
    expect(edgesFrom(flow, 'send').map((e) => [e.data.label, kindOf(flow, e.target)])).toEqual([['Sent', 'step'], ['Not sent', 'end']])
    expect(edgesFrom(flow, 'done').map((e) => kindOf(flow, e.target))).toEqual(['end'])
    // My ideas: Continue this idea goes back into the form; Main menu (no next) ends.
    expect(edgesFrom(flow, 'ideas').map((e) => [e.data.label, kindOf(flow, e.target)])).toEqual([['Continue this idea', 'step'], ['Main menu', 'end']])
    // Talk to us ends with the hand-over.
    expect(edgesFrom(flow, 'talk').map((e) => kindOf(flow, e.target))).toEqual(['end'])
  })

  it('lays the steps out top to bottom', () => {
    const flow = buildFlow(threeWay, 'main', types, { words })
    const y = (id) => flow.nodes.find((n) => n.id === id).position.y
    expect(y(START_ID)).toBeLessThan(y('main'))
    expect(y('main')).toBeLessThan(y('form'))
    expect(y('form')).toBeLessThan(y('photo'))
  })

  it('uses the menu next for an answer with no target, as the engine does', () => {
    const steps = [
      { key: 'm', type: 'menu', text: label('Menu'), settings: { options: [{ label: label('A'), next: '' }] }, next: 'e' },
      { key: 'e', type: 'end', text: label('Bye'), settings: {}, next: '' },
    ]
    expect(edgesFrom(buildFlow(steps, 'm', types), 'm').map((e) => e.target)).toEqual(['e'])
  })

  it('shows a condition as Yes and No', () => {
    const steps = [
      { key: 'c', type: 'condition', text: {}, settings: { true_next: 'a', false_next: 'b' }, next: '' },
      { key: 'a', type: 'end', text: label('A'), settings: {}, next: '' },
      { key: 'b', type: 'end', text: label('B'), settings: {}, next: '' },
    ]
    expect(edgesFrom(buildFlow(steps, 'c', types, { words }), 'c').map((e) => e.data.label)).toEqual(['Yes', 'No'])
  })

  it('marks a question with no next as leading nowhere', () => {
    const steps = [{ key: 'q', type: 'question', text: label('Name?'), settings: {}, next: '' }]
    const flow = buildFlow(steps, 'q', types)
    const end = flow.nodes.find((n) => n.data.kind === 'end')
    expect(end.data.problem).toBe(true)
  })

  it('never changes the steps it draws', () => {
    const before = JSON.stringify(threeWay)
    buildFlow(threeWay, 'main', types, { words })
    expect(JSON.stringify(threeWay)).toBe(before)
  })
})

describe('problems', () => {
  it('finds steps nothing reaches', () => {
    const steps = [...threeWay, { key: 'lost', type: 'message', text: label('Hello'), settings: {}, next: '' }]
    expect(unreachable(steps, 'main', types)).toEqual(['lost'])
    expect(flowProblems(steps, 'main', types).filter((p) => p.code === 'unreachable').map((p) => p.node)).toEqual(['lost'])
  })

  it('finds a branch that leads nowhere and a question with no answers', () => {
    const steps = [
      { key: 'm', type: 'menu', text: label('Menu'), settings: { options: [{ label: label('A'), next: 'q' }, { label: label('B'), next: '' }] }, next: '' },
      { key: 'q', type: 'question', text: label('Pick'), settings: { answer_type: 'choice', choices: [] }, next: '' },
    ]
    const codes = flowProblems(steps, 'm', types).map((p) => `${p.node}:${p.code}`)
    expect(codes).toContain('m:option_goes_nowhere')
    expect(codes).toContain('q:no_options')
    expect(codes).toContain('q:goes_nowhere')
  })

  it('has no problems for a complete flow', () => {
    expect(flowProblems(threeWay, 'main', types)).toEqual([])
  })

  it('says which steps a delete leaves with nothing leading to them', () => {
    expect(strandedBy(threeWay, 'main', types, 'photo').sort()).toEqual(['done', 'send'])
    expect(strandedBy(threeWay, 'main', types, 'talk')).toEqual([])
  })
})

describe('saving back', () => {
  it('an untouched flow saves back exactly as it came', () => {
    const journey = { id: 'j', start_key: 'main', nodes: threeWay.map((n) => ({ ...n, title: '', position: { x: 1, y: 2 } })) }
    const nodes = fromJourney(journey)
    buildFlow(nodes, journey.start_key, types, { words })
    expect(toPayload(nodes)).toEqual(toPayload(fromJourney(journey)))
    expect(toPayload(nodes).map((n) => n.position)).toEqual(journey.nodes.map((n) => n.position))
  })
})
