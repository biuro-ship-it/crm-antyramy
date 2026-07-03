/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantyczne tokeny oparte o zmienne CSS (kanały RGB) —
        // wartości dla trybu jasnego/ciemnego definiuje src/index.css.
        // Zapis rgb(var(--c-*) / <alpha-value>) zachowuje modyfikatory przezroczystości (np. bg-ink/30).
        primary: 'rgb(var(--c-primary) / <alpha-value>)',
        'on-primary': 'rgb(var(--c-on-primary) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        'inverse-canvas': 'rgb(var(--c-inverse-canvas) / <alpha-value>)',
        'inverse-ink': 'rgb(var(--c-inverse-ink) / <alpha-value>)',
        'surface-soft': 'rgb(var(--c-surface-soft) / <alpha-value>)',
        hairline: 'rgb(var(--c-hairline) / <alpha-value>)',
        'hairline-soft': 'rgb(var(--c-hairline-soft) / <alpha-value>)',
        'block-lime': 'rgb(var(--c-block-lime) / <alpha-value>)',
        'block-lilac': 'rgb(var(--c-block-lilac) / <alpha-value>)',
        'block-cream': 'rgb(var(--c-block-cream) / <alpha-value>)',
        'block-pink': 'rgb(var(--c-block-pink) / <alpha-value>)',
        'block-gray': 'rgb(var(--c-block-gray) / <alpha-value>)',
        'block-mint': 'rgb(var(--c-block-mint) / <alpha-value>)',
        'block-coral': 'rgb(var(--c-block-coral) / <alpha-value>)',
        'block-navy': 'rgb(var(--c-block-navy) / <alpha-value>)',
        'on-block': 'rgb(var(--c-on-block) / <alpha-value>)',
        'accent-magenta': 'rgb(var(--c-accent-magenta) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '400' }],
        'display-lg': ['4rem', { lineHeight: '1.1', letterSpacing: '-0.015em', fontWeight: '400' }],
        headline: ['1.625rem', { lineHeight: '1.35', letterSpacing: '-0.01em', fontWeight: '600' }],
        subhead: ['1.625rem', { lineHeight: '1.35', letterSpacing: '-0.01em', fontWeight: '400' }],
        'card-title': ['1.5rem', { lineHeight: '1.45', fontWeight: '700' }],
        'body-lg': ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.007em', fontWeight: '400' }],
        body: ['1.125rem', { lineHeight: '1.45', letterSpacing: '-0.014em', fontWeight: '400' }],
        'body-sm': ['1rem', { lineHeight: '1.45', letterSpacing: '-0.009em', fontWeight: '400' }],
        btn: ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.005em', fontWeight: '500' }],
        eyebrow: ['1.125rem', { lineHeight: '1.3', letterSpacing: '0.03em', fontWeight: '400' }],
        caption: ['0.75rem', { lineHeight: '1', letterSpacing: '0.05em', fontWeight: '400' }],
      },
      borderRadius: {
        xs: '2px',
        sm: '6px',
        md: '8px',
        lg: '24px',
        xl: '32px',
        pill: '50px',
      },
      spacing: {
        xxs: '4px',
        section: '96px',
        xxl: '48px',
      },
      maxWidth: {
        content: '1280px',
      },
      boxShadow: {
        soft: '0 4px 16px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};
