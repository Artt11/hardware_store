import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F8F9FA',
        surface: '#FFFFFF',
        brand: {
          dark: '#0B0F17',
          charcoal: '#1E293B',
          accent: '#FF5500', // Signal industrial orange for high-contrast CTA accents
          muted: '#64748B',
          light: '#F1F5F9',
        },
      },
      boxShadow: {
        'antigravity-sm': '0 10px 20px -5px rgba(0, 0, 0, 0.04), 0 4px 8px -2px rgba(0, 0, 0, 0.02)',
        'antigravity': '0 20px 35px -10px rgba(0, 0, 0, 0.08), 0 10px 20px -5px rgba(0, 0, 0, 0.03)',
        'antigravity-lg': '0 30px 60px -12px rgba(0, 0, 0, 0.12), 0 18px 36px -18px rgba(0, 0, 0, 0.06)',
      },
      transitionTimingFunction: {
        'antigravity': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
