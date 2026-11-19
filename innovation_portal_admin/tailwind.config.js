

import { optionDTheme } from "./tailwind.tokens.js"

const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      ...optionDTheme,
      colors: {
        ...optionDTheme.colors,
        // Older names, kept so existing pages pick up Option D. Use the
        // semantic names (primary, accent, surface2, border, text, muted,
        // banner, success, warning, danger, info) in new code.
        ceda: {
          forest:        v("primary"),
          "forest-dark": v("primary-hover"),
          "forest-light":"#B8341E",

          green:         v("accent"),
          "green-dark":  "#C94F12",
          "green-pale":  v("surface2"),
          "green-muted": v("muted"),

          indigo:        v("info"),
          "indigo-dark": "#175A85",
          "indigo-pale": v("info-soft"),

          gold:          v("warning"),
          "gold-light":  v("accent"),
          "gold-pale":   v("warning-soft"),

          red:           v("danger"),
          "red-light":   "#dc2626",
          "red-pale":    v("danger-soft"),

          surface:       v("surface2"),
          border:        v("border"),
          muted:         v("muted"),
          dark:          v("text"),

          "sidebar-bg":     v("banner"),
          "sidebar-hover":  "rgba(255,255,255,0.08)",
          "sidebar-active": v("banner-deep"),
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
      fontSize: {
        ...optionDTheme.fontSize,
        "2xs": ["10px", { lineHeight: "14px" }],
      },
      borderRadius: optionDTheme.borderRadius,
      boxShadow: {
        ...optionDTheme.boxShadow,
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
