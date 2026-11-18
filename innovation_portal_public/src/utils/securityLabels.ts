
import type { AccountSecurity } from '../types/security'


export interface SecurityLevelMeta {
  label: string
  color: string
  bg: string
  border: string
  dotColor: string
}

export const SECURITY_LEVEL: Record<string, SecurityLevelMeta> = {
  high: {
    label:    'Strong',
    color:    'text-green-700',
    bg:       'bg-green-50',
    border:   'border-green-200',
    dotColor: '#15803d',
  },
  medium: {
    label:    'Fair',
    color:    'text-amber-700',
    bg:       'bg-amber-50',
    border:   'border-amber-200',
    dotColor: '#b45309',
  },
  low: {
    label:    'Needs attention',
    color:    'text-red-600',
    bg:       'bg-red-50',
    border:   'border-red-200',
    dotColor: '#dc2626',
  },
}


export function buildHealthSummary(data: AccountSecurity): string {
  const method = labelAuthMethod(data.primary_auth_method)

  if (data.security_level === 'high' && data.policy_compliant) {
    if (data.has_password && data.linked_provider_count > 0) {
      return `You sign in with ${method} and have multiple ways to access your account.`
    }
    if (data.has_password) {
      return `You sign in with a password. Your account is well protected.`
    }
    return `You sign in with ${method}. Your account is in good shape.`
  }

  if (!data.has_password && data.linked_provider_count === 1) {
    return `You sign in with ${method} only. Adding a password gives you a backup way in.`
  }

  if (!data.has_password && data.linked_provider_count === 0) {
    return `Your account has no active sign-in method. Please add a password or link a provider.`
  }

  if (data.linked_provider_count > 1 && !data.has_password) {
    return `You sign in with ${method} and have ${data.linked_provider_count} linked providers. Adding a password would strengthen your account further.`
  }

  if (data.requires_verified_email) {
    return `You sign in with ${method}. Verifying your email will improve your account's recovery options.`
  }

  if (data.requires_password_fallback) {
    return `You sign in with ${method}. Consider adding a password as a backup sign-in method.`
  }

  return `You sign in with ${method}. Your account is working, but could be more secure.`
}


export const AUTH_METHOD_LABEL: Record<string, string> = {
  password:  'password',
  google:    'Google',
  github:    'GitHub',
  microsoft: 'Microsoft',
}

export function labelAuthMethod(method: string): string {
  return AUTH_METHOD_LABEL[method] ?? method
}


export interface ProviderMeta {
  label: string
  description: string
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  google:    { label: 'Google',    description: 'Sign in with your Google account' },
  github:    { label: 'GitHub',    description: 'Sign in with your GitHub account' },
  microsoft: { label: 'Microsoft', description: 'Sign in with your Microsoft account' },
}


export interface ActionMeta {
  label: string
  description: string
  priority: number
  cta: string
}

export const ACTION_META: Record<string, ActionMeta> = {
  add_password:                 { label: 'Add a password',           description: 'A password gives you a backup way to sign in if your provider is ever unavailable.',             priority: 1, cta: 'Add password'          },
  set_password:                 { label: 'Add a password',           description: 'A password gives you a backup way to sign in if your provider is ever unavailable.',             priority: 1, cta: 'Add password'          },
  verify_email:                 { label: 'Verify your email',        description: 'Confirming your email makes it easier to recover your account if you ever get locked out.',       priority: 1, cta: 'Check your email'      },
  link_provider:                { label: 'Link another sign-in',     description: 'Connecting a second sign-in method means you always have a backup way into your account.',       priority: 2, cta: 'Link a provider'       },
  add_provider:                 { label: 'Link a sign-in provider',  description: 'Connecting a social account gives you more flexibility and a backup way to sign in.',            priority: 2, cta: 'Link a provider'       },
  add_recovery_method:          { label: 'Add a recovery option',    description: 'A recovery method helps you get back in if you ever lose access to your main sign-in.',          priority: 2, cta: 'Add recovery method'    },
  avoid_unlink:                 { label: 'Keep at least one provider', description: 'You need at least one active sign-in method. Add a password before removing a provider.',      priority: 1, cta: 'Add password first'    },
  change_password:              { label: 'Update your password',     description: 'Keeping your password current helps protect your account.',                                      priority: 2, cta: 'Change password'        },
  requires_additional_recovery: { label: 'Add a recovery option',    description: 'A second recovery method gives you a safety net if something goes wrong.',                       priority: 2, cta: 'Add recovery method'    },
}

export function getActionMeta(code: string): ActionMeta {
  return ACTION_META[code] ?? {
    label:       code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: 'Taking this step will improve your account security.',
    priority:    3,
    cta:         'Review',
  }
}


export interface SortedAction {
  code:        string
  meta:        ActionMeta
  isBlocking:  boolean
}

export function getSortedActions(data: AccountSecurity): SortedAction[] {
  const codes = new Set(data.recommended_action_codes)

  if (data.requires_password_fallback && !data.has_password) {
    codes.add('set_password')
  }
  if (data.requires_verified_email) {
    codes.add('verify_email')
  }
  if (data.requires_additional_recovery_method) {
    codes.add('requires_additional_recovery')
  }

  const blocking = new Set(data.blocking_flags)

  return Array.from(codes)
    .map(code => ({ code, meta: getActionMeta(code), isBlocking: blocking.has(code) }))
    .sort((a, b) => {
      if (a.isBlocking && !b.isBlocking) return -1
      if (!a.isBlocking && b.isBlocking) return 1
      return a.meta.priority - b.meta.priority
    })
}


export function passwordSetSuccessMsg(): string {
  return 'Password added. You now have a backup way to sign in.'
}

export function passwordChangedSuccessMsg(): string {
  return 'Password updated successfully.'
}

export function providerLinkedSuccessMsg(provider: string): string {
  const name = PROVIDER_META[provider]?.label ?? provider
  return `${name} linked. You now have another way to sign in.`
}

export function providerUnlinkedSuccessMsg(provider: string, remainingCount: number): string {
  const name = PROVIDER_META[provider]?.label ?? provider
  if (remainingCount > 0) {
    return `${name} removed. Your account still has other sign-in methods.`
  }
  return `${name} removed.`
}


export function unlinkBlockReason(flags: string[], hasPassword: boolean, linkedCount: number): string | null {
  if (linkedCount <= 1 && !hasPassword) {
    return 'Add a password first — this is your only way to sign in.'
  }
  if (flags.includes('single_login_method') && !hasPassword) {
    return 'This is your only sign-in method. Set a password before removing it.'
  }
  return null
}
