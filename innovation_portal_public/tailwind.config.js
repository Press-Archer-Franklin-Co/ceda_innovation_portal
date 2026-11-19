import { optionDTheme } from './tailwind.tokens.js'

const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      ...optionDTheme,
      colors: {
        ...optionDTheme.colors,
        // Older names, kept so existing pages pick up Option D. Use the
        // semantic names above in new code.
        ceda: {
          dark:    v('primary'),
          darker:  v('primary-hover'),
          green:   v('accent'),
          light:   v('surface2'),
          muted:   v('muted'),
        },
        indigo: {
          ceda: v('info'),
        },
      },
      borderRadius: {
        ...optionDTheme.borderRadius,
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      boxShadow: {
        ...optionDTheme.boxShadow,
        card: '0 4px 24px rgba(0,0,0,0.07)',
        'card-hover': '0 8px 40px rgba(0,0,0,0.13)',
      },
    },
  },
  plugins: [],
}
