/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b0c0e', 900: '#111316', 850: '#15181c', 800: '#1a1d22', 700: '#23272e', 600: '#2e333b', 500: '#3d434d' },
        metal: { 300: '#c9ced6', 400: '#a3aab5', 500: '#7d8591', 600: '#5c636e' },
        teal: { 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488' },
        rpm: { 400: '#fb923c', 500: '#f97316', 600: '#ea580c' },
      },
      fontFamily: {
        sans: ['Inter', 'Pretendard', 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
