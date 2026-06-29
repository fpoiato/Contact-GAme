/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        purple: { electric: '#7C3AED' },
        yellow: { bright: '#FACC15' },
        mint: '#34D399',
        coral: '#FB7185',
      },
      animation: {
        bounceBtn: 'bounceBtn 0.4s ease',
      },
      keyframes: {
        bounceBtn: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.95)' },
        },
      },
    },
  },
  plugins: [],
};
