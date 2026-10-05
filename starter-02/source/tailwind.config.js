/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // ---- Certification Ledger tokens (src/styles/certification-ledger.css) ----
      // Mirrors of the :root --sc-* custom properties so Tailwind utilities and
      // inline var() styles consume ONE token system. Values reference the CSS
      // vars — never duplicate the hex here. Usage: bg-sc-surface, text-sc-ink,
      // border-sc-line, rounded-sc-card, shadow-sc-1, font-sc-mono, text-fs-body.
      colors: {
        'sc-bg': 'var(--sc-bg)',
        'sc-surface': 'var(--sc-surface)',
        'sc-surface-2': 'var(--sc-surface-2)',
        'sc-surface-3': 'var(--sc-surface-3)',
        'sc-raised': 'var(--sc-raised)',
        'sc-tint-green': 'var(--sc-tint-green)',
        'sc-ink': 'var(--sc-ink)',
        'sc-ink-2': 'var(--sc-ink-2)',
        'sc-muted': 'var(--sc-muted)',
        'sc-faint': 'var(--sc-faint)',
        'sc-on-dark': 'var(--sc-on-dark)',
        'sc-line': 'var(--sc-line)',
        'sc-line-2': 'var(--sc-line-2)',
        'sc-line-strong': 'var(--sc-line-strong)',
        'sc-certified': 'var(--sc-certified)',       // CERTIFIED/PAID status only — never decoration
        'sc-certified-bg': 'var(--sc-certified-bg)',
        'sc-certified-bd': 'var(--sc-certified-bd)',
        'sc-action': 'var(--sc-action)',
        'sc-action-hover': 'var(--sc-action-hover)',
        'sc-action-bg': 'var(--sc-action-bg)',
        'sc-action-bd': 'var(--sc-action-bd)',
        'sc-warning': 'var(--sc-warning)',
        'sc-warning-bg': 'var(--sc-warning-bg)',
        'sc-danger': 'var(--sc-danger)',
        'sc-danger-bg': 'var(--sc-danger-bg)',
        'sc-danger-bd': 'var(--sc-danger-bd)',
      },
      fontFamily: {
        'sc-sans': 'var(--sc-font-sans)',
        'sc-mono': 'var(--sc-font-mono)',
        'sc-display': 'var(--sc-font-display)',
        'sc-ar': 'var(--sc-font-ar)',
      },
      fontSize: {
        'fs-micro': 'var(--fs-micro)',
        'fs-2xs': 'var(--fs-2xs)',
        'fs-xs': 'var(--fs-xs)',
        'fs-sm': 'var(--fs-sm)',
        'fs-body': 'var(--fs-body)',
        'fs-md': 'var(--fs-md)',
        'fs-lg': 'var(--fs-lg)',
        'fs-xl': 'var(--fs-xl)',
        'fs-2xl': 'var(--fs-2xl)',
        'fs-3xl': 'var(--fs-3xl)',
        'fs-4xl': 'var(--fs-4xl)',
      },
      borderRadius: {
        'sc-1': 'var(--r-1)',
        'sc-2': 'var(--r-2)',
        'sc-3': 'var(--r-3)',
        'sc-card': 'var(--r-4)',
        'sc-5': 'var(--r-5)',
        'sc-6': 'var(--r-6)',
        'sc-pill': 'var(--r-pill)',
      },
      boxShadow: {
        'sc-1': 'var(--shadow-1)',
        'sc-2': 'var(--shadow-2)',
        'sc-3': 'var(--shadow-3)',
        'sc-ring': 'var(--ring)',
        'sc-ring-action': 'var(--ring-action)',
      },
      // Animated-gradient background (src/site/marketing/AnimatedGradient.jsx). The circles
      // drift via --tx*/--ty* CSS vars over var(--background-gradient-speed). Adapted from the
      // shadcn snippet to our ESM config. Reduced-motion is honoured in site.css.
      animation: {
        'background-gradient':
          'background-gradient var(--background-gradient-speed, 15s) cubic-bezier(0.445, 0.05, 0.55, 0.95) infinite',
      },
      keyframes: {
        'background-gradient': {
          '0%, 100%': {
            transform: 'translate(0, 0)',
            animationDelay: 'var(--background-gradient-delay, 0s)',
          },
          '20%': { transform: 'translate(calc(100% * var(--tx-1, 1)), calc(100% * var(--ty-1, 1)))' },
          '40%': { transform: 'translate(calc(100% * var(--tx-2, -1)), calc(100% * var(--ty-2, 1)))' },
          '60%': { transform: 'translate(calc(100% * var(--tx-3, 1)), calc(100% * var(--ty-3, -1)))' },
          '80%': { transform: 'translate(calc(100% * var(--tx-4, -1)), calc(100% * var(--ty-4, -1)))' },
        },
      },
    },
  },
  plugins: [],
};
