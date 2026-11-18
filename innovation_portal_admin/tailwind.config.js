

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ceda: {
          forest:        "#A01E0A",
          "forest-dark": "#7E1708",
          "forest-light":"#B8341E",

          green:         "#F0641E",
          "green-dark":  "#C94F12",
          "green-pale":  "#F5EEE8",
          "green-muted": "#6B5248",

          indigo:        "#1D6FA3",
          "indigo-dark": "#175A85",
          "indigo-pale": "#E6F0F7",

          gold:          "#9A5200",
          "gold-light":  "#F0641E",
          "gold-pale":   "#FBEEDD",

          red:           "#B42318",
          "red-light":   "#dc2626",
          "red-pale":    "#fee2e2",

          surface:       "#F5EEE8",
          border:        "#E6D9CF",
          muted:         "#6B5248",
          dark:          "#2E1E18",

          "sidebar-bg":     "#5A3C32",
          "sidebar-hover":  "rgba(255,255,255,0.08)",
          "sidebar-active": "#3E2922",
        },
        status: {
          "draft-bg":    "#F1F5F9",
          "draft-text":  "#475569",
          "submitted-bg":   "#F5EEE8",
          "submitted-text": "#A01E0A",
          "review-bg":   "#E6F0F7",
          "review-text": "#175A85",
          "finalist-bg":   "#FBEEDD",
          "finalist-text": "#7A5010",
          "winner-bg":   "#F5EEE8",
          "winner-text": "#7E1708",
          "rejected-bg":   "#fee2e2",
          "rejected-text": "#B42318",
          "active-bg":   "#F5EEE8",
          "active-text": "#A01E0A",
          "pending-bg":  "#FBEEDD",
          "pending-text":"#7A5010",
          "info-bg":     "#F5EEE8",
          "info-text":   "#A01E0A",
        },
      },
      fontFamily: {
        sans: [
          "Poppins",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
      },
      boxShadow: {
        card:        "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        "card-hover":"0 4px 12px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.06)",
        nav:         "0 4px 24px rgba(90,60,50,0.15)",
        modal:       "0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)",
        topbar:      "0 1px 0 #E6D9CF",
        mega:        "0 8px 32px rgba(0,0,0,0.12)",
      },
      animation: {
        "fade-in":    "fadeIn 0.2s ease-in-out",
        "slide-down": "slideDown 0.2s ease-out",
        "slide-in":   "slideIn 0.25s ease-out",
        "slide-up":   "slideUp 0.2s ease-out",
        "pulse-dot":  "pulseDot 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideDown: {
          "0%":   { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%":   { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.4" },
        },
      },
    },
  },
  plugins: [],
}
