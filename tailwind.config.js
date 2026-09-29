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
        },
        /**
         * Katzu V2 tokens. Separate names on purpose: the legacy palette above
         * still drives the screens that have not migrated yet, and a V2 screen
         * must never accidentally inherit a legacy hex.
         *
         * `lavender` / `magenta` are Katzu's own eye colours — lavender is the
         * normal primary accent, magenta is reserved for earned progress.
         */
        kz: {
          black: '#000000',
          near: '#050508',
          soft: '#0A0A0D',
          lavender: '#B4A0FF',
          lavenderDeep: '#7C5CF0',
          magenta: '#FF6FD8',
          magentaDeep: '#E23FAE',
          ink: '#F6F2EE',
          inkDim: '#A79FC4',
          inkFaint: '#7E7796',
          warm: '#FFC98A',
          amber: '#FF9E4A',
          cool: '#8FB8FF',
          neon: '#6FF0D0',
        },
      },
      fontFamily: {
        arabic: ['Cairo', 'sans-serif'],
        german: ['Satoshi', 'Source Serif 4', 'sans-serif'],
      },
      borderRadius: {
        squircle: '28px',
        'squircle-lg': '34px',
      },
      boxShadow: {
        'glow-purple': '0 0 25px rgba(139, 111, 232, 0.25)',
        'glow-purple-lg': '0 0 40px rgba(139, 111, 232, 0.4)',
        'glow-green': '0 0 25px rgba(127, 217, 168, 0.25)',
        'kz-lavender': '0 0 0 1px rgba(180, 160, 255, 0.28), 0 10px 34px rgba(124, 92, 240, 0.28)',
        'kz-magenta': '0 0 0 1px rgba(255, 111, 216, 0.30), 0 10px 40px rgba(226, 63, 174, 0.30)',
      },
      keyframes: {
        // V19: kz-sheen (never referenced anywhere), kz-rise (decorative entry
        // motion removed) and kz-scene-drift (26s infinite loop removed) are
        // gone with their call sites. kz-glow-pulse stays: it is the syncing
        // dot's state signal and the SiriWave fallback's working indicator.
        'kz-glow-pulse': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'kz-glow-pulse': 'kz-glow-pulse 3.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
