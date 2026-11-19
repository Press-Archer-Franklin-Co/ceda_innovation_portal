/*
 * CEDA Option D tokens for Tailwind. Identical in both frontends.
 * Values live in src/styles/tokens.css (CSS variables, light and dark).
 * Use these semantic names in components: bg-bg, bg-surface, bg-surface2,
 * bg-banner, bg-primary, text-text, text-muted, border-border, bg-success-soft...
 */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export const optionDColors = {
  bg: c('bg'),
  surface: c('surface'),
  surface2: c('surface2'),
  border: c('border'),
  text: c('text'),
  muted: c('muted'),
  banner: {
    DEFAULT: c('banner'),
    deep: c('banner-deep'),
    muted: c('banner-muted'),
  },
  'on-banner': c('on-banner'),
  primary: {
    DEFAULT: c('primary'),
    hover: c('primary-hover'),
    soft: c('primary-soft'),
  },
  'on-primary': c('on-primary'),
  accent: {
    DEFAULT: c('accent'),
    soft: c('accent-soft'),
    ink: c('accent-ink'),
  },
  'on-accent': c('on-accent'),
  amber: { DEFAULT: c('amber') },
  yellow: { DEFAULT: c('yellow') },
  success: { DEFAULT: c('success'), soft: c('success-soft') },
  warning: { DEFAULT: c('warning'), soft: c('warning-soft') },
  danger: { DEFAULT: c('danger'), soft: c('danger-soft') },
  info: { DEFAULT: c('info'), soft: c('info-soft') },
  cms: { DEFAULT: c('cms'), soft: c('cms-soft') },
  scrim: c('scrim'),
}

export const optionDTheme = {
  colors: optionDColors,
  fontFamily: {
    sans: ['var(--font-body)'],
    body: ['var(--font-body)'],
    heading: ['var(--font-heading)'],
  },
  // Figma text styles D/*: [size, { lineHeight, fontWeight, letterSpacing }]
  fontSize: {
    'd-h1': ['56px', { lineHeight: '64px', fontWeight: '800' }],
    'd-mh1': ['34px', { lineHeight: '40px', fontWeight: '800' }],
    'd-h2': ['36px', { lineHeight: '44px', fontWeight: '700' }],
    'd-h3': ['24px', { lineHeight: '32px', fontWeight: '700' }],
    'd-h4': ['18px', { lineHeight: '26px', fontWeight: '700' }],
    'd-h5': ['15px', { lineHeight: '22px', fontWeight: '600' }],
    'd-body': ['16px', { lineHeight: '26px' }],
    'd-body-s': ['14px', { lineHeight: '22px' }],
    'd-label': ['14px', { lineHeight: '20px', fontWeight: '700' }],
    'd-label-s': ['12px', { lineHeight: '16px', fontWeight: '700' }],
    'd-cap': ['12px', { lineHeight: '18px' }],
    'd-over': ['11px', { lineHeight: '16px', fontWeight: '700', letterSpacing: '0.08em' }],
    'd-btn': ['15px', { lineHeight: '20px', fontWeight: '600' }],
    'd-btn-s': ['13px', { lineHeight: '18px', fontWeight: '600' }],
  },
  borderRadius: {
    control: 'var(--radius-control)',
    card: 'var(--radius-card)',
  },
  ringColor: { DEFAULT: c('primary') },
  boxShadow: {
    focus: '0 0 0 3px rgb(var(--c-primary) / 0.25)',
    pop: '0 12px 32px rgb(var(--c-scrim) / 0.16), 0 2px 8px rgb(var(--c-scrim) / 0.08)',
  },
}
