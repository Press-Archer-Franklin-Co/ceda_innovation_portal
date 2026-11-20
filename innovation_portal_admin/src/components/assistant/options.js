// Choices shared by the guidance and manual editors (C3).
export function audienceOptions(t) {
  return ['everyone', 'innovators', 'officers'].map((value) => ({ value, label: t(`ai.audience.${value}`) }))
}

export function languageOptions(t) {
  return ['any', 'en', 'tn'].map((value) => ({ value, label: t(`ai.language.${value}`) }))
}
