/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#000000',
        surface: {
          DEFAULT: '#0D0B12',
          card: '#0D0B12',
          subtle: '#16121F',
          raised: '#16121F',
          highest: '#221A30',
          hero: '#1A132B',
          heroSubtle: '#261D3D',
        },
        primary: {
          DEFAULT: '#8B6FE8',
          pressed: '#7659D4',
          container: '#997DF7',
          fixed: '#E7DEFF',
          fixedDim: '#CDBDFF',
        },
        secondary: {
          DEFAULT: '#D5BAFF',
          container: '#543684',
        },
        tertiary: {
          DEFAULT: '#F1B4DC',
          container: '#B780A5',
        },
        status: {
          success: '#7FD9A8',
          learning: '#F0C674',
          error: '#E89B9B',
        },
        article: {
          der: '#7EA6FF', // Masculine
          die: '#F5B8E0', // Feminine
          das: '#7FD9A8', // Neuter
        },
        text: {
          primary: '#F2F0F7',
          secondary: '#A8A3BD',
          muted: '#6E6887',
        },
        border: {
          subtle: '#2E2640',
          active: 'rgba(139, 111, 232, 0.4)',
        }
      },
      fontFamily: {
        arabic: ['Cairo', 'sans-serif'],
        german: ['Satoshi', 'Source Serif 4', 'sans-serif'],
      },
      boxShadow: {
        'glow-purple': '0 0 25px rgba(139, 111, 232, 0.25)',
        'glow-purple-lg': '0 0 40px rgba(139, 111, 232, 0.4)',
        'glow-green': '0 0 25px rgba(127, 217, 168, 0.25)',
      }
    },
  },
  plugins: [],
}
