// apps/web/tailwind.config.ts
//
// AbotKamay design tokens (brand/BRAND.md). Tailwind CSS v4 loads this file through the
// `@config` directive in app/globals.css; everything else about Tailwind lives in that CSS file.
//
// Contrast rules that the scales below are tuned for (WCAG 2.2 AA):
// - Body text: ink (15.1:1 on white) or ink-600, the brand's Muted Green-Gray (5.9:1 on white,
//   5.5:1 on cream). Nothing lighter than ink-600 carries text on cream.
// - teal-600 (Bayanihan Teal) is the primary color: 5.1:1 on white, 4.8:1 on cream.
// - coral-500 (Kalinga Coral) is 3.6:1 on white: large text, icons and graphics only. Use coral-700
//   or darker for small text.
// - gold-400 (Sunrise Gold) is decorative (progress bars, highlights). Never text on white; ink on
//   gold is 8.3:1.
// - Input borders use ink-400 or darker, so fields keep a 3:1 boundary (WCAG 1.4.11).
// Money states: teal = verified or disbursed, gold = in progress, coral = needs attention.
// Never use red for danger on a beneficiary's page; it reads as blame.
import type { Config } from 'tailwindcss';

const config = {
  theme: {
    extend: {
      colors: {
        teal: {
          50: '#ECF8F5',
          100: '#D0EFE8',
          200: '#A3DFD2',
          300: '#6DCAB7',
          400: '#2DBFA3', // brand dark-mode tint (Light Teal)
          500: '#149C85',
          600: '#0E7C6B', // Bayanihan Teal: primary
          700: '#0B6559',
          800: '#0A5047',
          900: '#0A3F38',
          950: '#062521',
        },
        coral: {
          50: '#FDF2EE',
          100: '#FBE1D7',
          200: '#F7C1AD',
          300: '#F29B7D',
          400: '#F27A56', // brand dark-mode tint (Light Coral)
          500: '#E0603A', // Kalinga Coral: accent
          600: '#C24B28',
          700: '#A03C20',
          800: '#7F311C',
          900: '#682B1A',
          950: '#381308',
        },
        gold: {
          50: '#FEF8EA',
          100: '#FDEFC9',
          200: '#FADE93',
          300: '#F7C45A', // brand dark-mode tint (Light Gold)
          400: '#F2B632', // Sunrise Gold: highlights and progress
          500: '#DF9B15',
          600: '#B97A0F',
          700: '#935C10',
          800: '#794914',
          900: '#663D15',
          950: '#3B2007',
        },
        cream: {
          DEFAULT: '#FFF8EC', // page background
          50: '#FFFCF7',
          100: '#FFF8EC',
          200: '#FBEEDA',
          300: '#F5E2C4',
        },
        ink: {
          DEFAULT: '#0B2B26', // headings and body text
          50: '#F3F6F5',
          100: '#E4EBE9',
          200: '#CAD7D4',
          300: '#A9BDB8',
          400: '#758F89',
          500: '#5E7B75',
          600: '#4A6B65', // Muted Green-Gray: secondary text
          700: '#37524D',
          800: '#213D38',
          900: '#0B2B26',
          950: '#061A17',
        },
      },
      fontFamily: {
        // Plus Jakarta Sans is self-hosted by next/font (app/layout.tsx) and exposed as --font-jakarta.
        sans: ['var(--font-jakarta)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(11 43 38 / 0.04), 0 4px 16px -6px rgb(11 43 38 / 0.08)',
        lift: '0 2px 6px rgb(11 43 38 / 0.05), 0 20px 44px -16px rgb(11 43 38 / 0.22)',
        cta: 'inset 0 1px 0 rgb(255 255 255 / 0.18), 0 10px 24px -10px rgb(14 124 107 / 0.6)',
        sheet: '0 -10px 32px -12px rgb(11 43 38 / 0.22)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'scale(0.4)' },
          '70%': { opacity: '1', transform: 'scale(1.08)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'progress-fill': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        'grow-y': {
          from: { transform: 'scaleY(0)' },
          to: { transform: 'scaleY(1)' },
        },
        draw: {
          to: { 'stroke-dashoffset': '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          from: { 'background-position': '200% 0' },
          to: { 'background-position': '-200% 0' },
        },
        'pulse-ring': {
          '0%': { opacity: '0.55', transform: 'scale(0.85)' },
          '100%': { opacity: '0', transform: 'scale(1.9)' },
        },
        scan: {
          from: { transform: 'translateY(-120%)' },
          to: { transform: 'translateY(420%)' },
        },
        'loading-bar': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(300%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out both',
        'fade-up': 'fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        pop: 'pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'progress-fill': 'progress-fill 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both',
        'grow-y': 'grow-y 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        draw: 'draw 1.4s cubic-bezier(0.65, 0, 0.35, 1) forwards',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 1.8s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
        scan: 'scan 1.6s cubic-bezier(0.45, 0, 0.55, 1) infinite',
        'loading-bar': 'loading-bar 1.1s cubic-bezier(0.65, 0, 0.35, 1) infinite',
      },
    },
  },
} satisfies Config;

export default config;
