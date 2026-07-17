/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f7f5ef',
        ink: '#17231f',
        forest: {
          50: '#edf6f2',
          100: '#d7ebe2',
          200: '#b2d7c7',
          500: '#2b725c',
          600: '#1f5c4a',
          700: '#194b3e',
          800: '#163d34',
          900: '#12332b',
        },
        oat: { 100: '#f1ede3', 200: '#e4decf', 300: '#d1c8b5' },
        amber: { 50: '#fff8e8', 100: '#ffedc2', 500: '#d88b18', 700: '#955b0d' },
        tomato: { 50: '#fff0ed', 500: '#d85b47', 700: '#a33a2a' },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(23,35,31,.05), 0 12px 32px rgba(23,35,31,.06)',
        float: '0 14px 34px rgba(31,92,74,.25)',
      },
      borderRadius: { '2xl': '1.25rem', '3xl': '1.75rem' },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
