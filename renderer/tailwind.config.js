/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#aa3bff',
        'primary-dark': '#8b2ee0',
        'primary-light': '#c084fc',
        'bg-dark': '#16171d',
        'bg-card-dark': '#1f2028',
        'border-dark': '#2e303a',
        'text-dim': '#9ca3af',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
