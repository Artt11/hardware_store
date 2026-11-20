import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f7f6f2',
        ink: { DEFAULT: '#14171f', soft: '#4b5160', faint: '#8a8f9c' },
        line: '#e4e2db',
        brand: {
          DEFAULT: '#f5c518', // store yellow
          soft: '#fdf3c4',
          deep: '#8a5a00', // amber for text on white: 6.3:1
        },
        ok: '#1f7a4d',
        danger: '#b42318',
      },
      fontFamily: {
        sans: ['"Noto Sans Armenian"', '"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '10px' },
      // Emil Kowalski's curves: strong ease-out for UI feedback, iOS-like for drawers.
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      boxShadow: {
        // One elevation for floating layers (menus, dialogs): offset + soft blur.
        float: '0 12px 32px -8px rgb(20 23 31 / 0.18), 0 2px 6px -2px rgb(20 23 31 / 0.08)',
      },
    },
  },
  // No sticky hover states on touch screens.
  future: { hoverOnlyWhenSupported: true },
  plugins: [],
} satisfies Config;
