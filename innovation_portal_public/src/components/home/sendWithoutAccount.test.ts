import { describe, expect, it } from 'vitest'
import { guestContactProblem } from '../../services/intake.service'
import { normalisePhone } from '../../lib/phone'
import en from '../../i18n/en'
import tn from '../../i18n/tn'

describe('Send without an account (1.2, 23 Nov)', () => {
  it('needs one of email or phone, and one is enough', () => {
    expect(guestContactProblem({ email: '', phone: '' })).toBe('none')
    expect(guestContactProblem({ email: 'neo@example.co.bw', phone: '' })).toBeNull()
    expect(guestContactProblem({ email: '', phone: '71 234 567' })).toBeNull()
    expect(guestContactProblem({ email: 'neo@example.co.bw', phone: '71 234 567' })).toBeNull()
  })

  it('checks what was given', () => {
    expect(guestContactProblem({ email: 'not an email', phone: '' })).toBe('email')
    expect(guestContactProblem({ email: '', phone: '12' })).toBe('phone')
  })

  it('sends the phone as E.164, like the rest of the app', () => {
    expect(normalisePhone('71 234 567')).toBe('+26771234567')
    expect(normalisePhone('+267 71 234 567')).toBe('+26771234567')
    expect(normalisePhone('')).toBe('')
  })

  it('says "one of the two is enough" in English and Setswana', () => {
    expect(en['qs2.oneOf']).toContain('One of the two is enough')
    expect(tn['qs2.oneOf']).toBeTruthy()
    expect(en['qs2.contactNeeded']).toBe('Give us an email or a phone number so we can reach you.')
    expect(tn['qs2.contactNeeded']).toBeTruthy()
    expect(en['sent.contactOn']).toContain('{contact}')
  })
})
