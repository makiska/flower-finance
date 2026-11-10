/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        leaf: { 50: '#f3faf4', 100: '#e3f4e6', 500: '#2f7d4a', 600: '#24663c', 700: '#1b5130', 800: '#164226' },
        soil: { 50: '#faf7f2', 100: '#f0e8dc', 700: '#5a4634', 900: '#2c2118' },
        petal: { 500: '#c45c6a', 600: '#a84856' },
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
    },
  },
  plugins: [],
};
