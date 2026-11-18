export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ceda: {
          dark:    '#A01E0A',
          darker:  '#7E1708',
          green:   '#F0641E',
          light:   '#F5EEE8',
          muted:   '#6B5248',
        },
        indigo: {
          ceda: '#1D6FA3',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.07)',
        'card-hover': '0 8px 40px rgba(0,0,0,0.13)',
      },
    },
  },
  plugins: [],
}
