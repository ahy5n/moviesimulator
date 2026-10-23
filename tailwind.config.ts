import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0B0F',
        panel: '#15151C',
        panel2: '#1D1D26',
        line: '#2A2A36',
        gold: { DEFAULT: '#D4AF37', light: '#E8CB6A', dark: '#9C7F22' },
        carpet: '#9B1B30',
        muted: '#8A8A9A',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        marquee: ['var(--font-marquee)', 'Impact', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        bulbs: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { bulbs: 'bulbs 1.2s ease-in-out infinite', rise: 'rise .35s ease-out both' },
    },
  },
  plugins: [],
} satisfies Config;
