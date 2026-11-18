
export interface LinkedProviderInfo {
  provider: 'google' | 'github' | 'microsoft' | string
  label?: string
  linked: boolean
  is_primary: boolean
  email?: string
  connected_at?: string
}

export interface AccountSecurity {
  primary_auth_method: string
  has_password: boolean
  linked_provider_count: number
  linked_accounts: LinkedProviderInfo[]

  recovery_methods: string[]

  account_risk_flags: string[]
  recommended_actions: string[]
  recommended_action_codes: string[]
  policy_flags: string[]
  blocking_flags: string[]
  enforcement_actions: string[]

  can_set_password: boolean
  can_change_password: boolean
  can_continue_without_action: boolean

  security_level: 'low' | 'medium' | 'high'
  policy_compliant: boolean

  requires_password_fallback: boolean
  requires_verified_email: boolean
  requires_additional_recovery_method: boolean

  mfa_enabled?: boolean
  mfa_method?: string
}
