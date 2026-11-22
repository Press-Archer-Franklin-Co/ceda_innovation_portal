import { describe, expect, it } from 'vitest'
import { introNotice } from './HelpBubble'

const away = 'We are closed now. Leave a message and we will reply on the next working day.'

describe('live chat intro (2.12)', () => {
  it('shows the away message once when the chat already posted it', () => {
    expect(introNotice(away, [{ author_role: 'system', body: away }, { author_role: 'person', body: 'Hello' }])).toBe('')
  })
  it('shows it at the top before anything is sent', () => {
    expect(introNotice(away, [])).toBe(away)
    expect(introNotice('', [])).toBe('')
  })
})
