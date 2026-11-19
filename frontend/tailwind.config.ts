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
      transitionTimingFunction: { out: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    },
  },
  plugins: [],
} satisfies Config;
