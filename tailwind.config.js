/**
 * Katzu Tailwind configuration.
 *
 * DESIGN SYSTEM CONTRACT
 * ----------------------
 * `src/index.css` owns the palette. Every colour below is written as
 * `rgb(var(--kz-…) / <alpha-value>)`, so this file *reads* the tokens rather
 * than declaring a second copy of them, and opacity modifiers keep working.
 *
 * That is what unifies the app: the `kz-*` names (new screens) and the legacy
 * `primary` / `surface-*` / `text-text-*` / `status-*` / `article-*` names (the
 * ~400 call sites already shipped) resolve to the same variables. A screen can
 * use either vocabulary and land on the identical colour.
 *
 * Two roles are deliberately kept apart, because merging them is what caused the
 * old 3.79:1 primary-button contrast failure:
 *   · accent  — `primary`, used for text, icons, borders, tints   (8.86:1)
 *   · fill    — `fill`, the background of a solid control         (4.52:1 w/ white)
 * Never write `bg-primary text-white`; that pairing no longer exists.
 */

import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */

/** RGB-triplet token reference that keeps Tailwind's `/opacity` modifier alive. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/**
 * The one corner ladder, read from src/index.css rather than copied here.
 * (Same rule the motion ladder already follows: this file references tokens, it
 * never redeclares their values.)
 */
const radius = (name) => `var(--kz-radius-${name})`;

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: token('kz-black'),
        surface: {
          DEFAULT: token('kz-soft-black'),
          card: token('kz-soft-black'),
          subtle: token('kz-near-black'),
          raised: token('kz-near-black'),
          highest: 'rgb(34 26 48 / <alpha-value>)',
          hero: 'rgb(26 19 43 / <alpha-value>)',
          heroSubtle: 'rgb(38 29 61 / <alpha-value>)',
        },

        /* Accent — text, icons, borders, tints. Never a filled control. */
        primary: {
          DEFAULT: token('kz-lavender'),
          pressed: token('kz-lavender-press'),
          container: token('kz-lavender-deep'),
          fixed: token('kz-lavender'),
          fixedDim: 'rgb(205 189 255 / <alpha-value>)',
        },

        /* Fill — the background of a solid control. Pair with `text-on-fill`. */
        fill: {
          DEFAULT: token('kz-lavender-deep'),
          pressed: token('kz-lavender-press'),
        },
        'on-fill': token('kz-on-fill'),
        'on-lavender': token('kz-on-lavender'),
        'on-danger': token('kz-on-danger'),

        secondary: {
          DEFAULT: 'rgb(213 186 255 / <alpha-value>)',
          container: 'rgb(84 54 132 / <alpha-value>)',
        },
        /* The palette's cool shoulder: a periwinkle at OKLCH h 272. It is the one
           step deliberately off the 288-300 violet axis, so the ramp has a
           direction instead of being five shades of the same purple. This step
           used to be a rose at h 340 — the pink this replaced. */
        tertiary: {
          DEFAULT: 'rgb(143 161 228 / <alpha-value>)',
          container: 'rgb(77 95 156 / <alpha-value>)',
        },
        status: {
          success: token('kz-neon'),
          learning: token('kz-warm'),
          error: token('kz-danger'),
          info: token('kz-info'),
        },
        article: {
          der: token('kz-cool'),
          // Pale lilac (h 300). Still far lighter than `der` (blue) and `das`
          // (teal), so the three German articles stay distinguishable at a
          // glance. This step used to be a rose at h 340.
          die: 'rgb(212 196 246 / <alpha-value>)',
          das: token('kz-neon'),
        },
        text: {
          primary: token('kz-ink'),
          secondary: token('kz-ink-dim'),
          muted: token('kz-ink-faint'),
        },
        border: {
          subtle: token('kz-line'),
          strong: token('kz-line-strong'),
          active: 'rgb(var(--kz-lavender) / <alpha-value>)',
        },

        /**
         * Katzu's eye colours, surfaced as their own tokens. `lavender` is the
         * normal accent, `magenta` is reserved for progress the app actually
         * recorded — magenta never means "tap me". It is the violet sibling of
         * lavender, not a second hue; tests/designSystem.test.ts pins these
         * values against src/index.css so a canvas-side copy cannot drift.
         */
        kz: {
          black: token('kz-black'),
          near: token('kz-near-black'),
          soft: token('kz-soft-black'),
          lavender: token('kz-lavender'),
          lavenderDeep: token('kz-lavender-deep'),
          magenta: token('kz-magenta'),
          magentaDeep: token('kz-magenta-deep'),
          ink: token('kz-ink'),
          inkDim: token('kz-ink-dim'),
          inkFaint: token('kz-ink-faint'),
          warm: token('kz-warm'),
          amber: token('kz-amber'),
          cool: token('kz-cool'),
          neon: token('kz-neon'),
          danger: token('kz-danger'),
          line: token('kz-line'),
          lineStrong: token('kz-line-strong'),
        },
      },

      /* ------------------------------------------------------------------ *
       * Type scale. One ladder, four steps, both scripts. The Arabic sizes are
       * the default because Arabic is the reading language; the German display
       * size is deliberately smaller and stays available for mixed headings.
       * ------------------------------------------------------------------ */
      fontSize: {
        display: ['var(--kz-ar-display)', { lineHeight: '1.32', letterSpacing: '-0.01em' }],
        title: ['var(--kz-ar-title)', { lineHeight: '1.45' }],
        body: ['var(--kz-ar-body)', { lineHeight: '1.75' }],
        // G4: caption ≥13px and micro ≥12px — the legibility floor for Arabic
        // on AMOLED; line-height ≥1.6 keeps the script's joins intact.
        caption: ['var(--kz-ar-caption)', { lineHeight: '1.65' }],
        micro: ['var(--kz-ar-micro)', { lineHeight: '1.6' }],
      },
      fontWeight: {
        /* Cairo is variable 100–900, so "bold" can be genuinely bold without
           a second font file. Named so code says what it means. */
        ar: '700',
        arStrong: '800',
      },

      fontFamily: {
        arabic: ['Cairo', 'sans-serif'],
        german: ['Satoshi', 'Source Serif 4', 'sans-serif'],
      },

      /* ------------------------------------------------------------------ *
       * Radius scale. Named by the *role* a corner plays, so a control, a chip
       * and a sheet can never disagree about how round they are. Tailwind's
       * default `rounded-2xl`/`3xl` are left alone: hundreds of call sites
       * already resolve to them and redefining them would shift live layouts.
       *
       * V34: the values moved into src/index.css (`--kz-radius-*`) and are read
       * from here. `.kz-primary` used to carry its own private 22px while the
       * secondary button beside it used `control`, so two neighbouring buttons
       * differed by two pixels. One ladder, declared once, is what stops that.
       * ------------------------------------------------------------------ */
      borderRadius: {
        chip: radius('chip'),
        control: radius('control'),
        panel: radius('panel'),
        sheet: radius('sheet'),
        /** Inline text highlight on a single word — tight, or it reads as a box. */
        tag: radius('tag'),
        squircle: radius('sheet'),
        'squircle-lg': radius('hero'),
      },

      /* ------------------------------------------------------------------ *
       * Hit targets. 44px is the floor for anything a thumb has to find;
       * 48px is the comfortable target the primary action uses. Naming them
       * makes "is this big enough" a question the codebase can answer.
       * ------------------------------------------------------------------ */
      spacing: {
        touch: '44px',
        control: '48px',
      },
      minHeight: { touch: '44px', control: '48px' },
      minWidth: { touch: '44px', control: '48px' },

      /* ------------------------------------------------------------------ *
       * Motion. The fifth scale, and the one that was missing: the app had
       * a complete, deliberate motion ladder in src/index.css that nothing
       * read, so every transition in Katzu silently fell back to Tailwind's
       * undeclared 150ms default. Nobody chose 150ms; that is what you get
       * when you write `transition-colors` and stop.
       *
       * These are readers, not copies — a value change in the token block
       * moves every transition in the app.
       * ------------------------------------------------------------------ */
      transitionDuration: {
        fast: 'var(--kz-dur-fast)',
        DEFAULT: 'var(--kz-dur)',
        panels: 'var(--kz-dur-panels)',
      },
      transitionTimingFunction: {
        spring: 'var(--kz-ease-spring)',
        out: 'var(--kz-ease-out)',
      },

      boxShadow: {
        'glow-purple': '0 0 25px rgba(139, 111, 232, 0.25)',
        'glow-purple-lg': '0 0 40px rgba(139, 111, 232, 0.4)',
        'glow-green': '0 0 25px rgba(127, 217, 168, 0.25)',
        'kz-lavender': '0 0 0 1px rgba(180, 160, 255, 0.28), 0 10px 34px rgba(124, 92, 240, 0.28)',
        'kz-magenta': '0 0 0 1px rgba(174, 123, 255, 0.30), 0 10px 40px rgba(115, 67, 222, 0.30)',
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
  plugins: [
    /**
     * `pointer-hover:` — hover, only where a pointer can hover.
     *
     * V34: every `hover:` in the app became this. A phone has no hovering
     * pointer, and browsers emulate `:hover` from the last tap — so a tap on a
     * card used to leave that card looking selected until the learner tapped
     * somewhere else. Gating the variant on `(hover: hover) and (pointer: fine)`
     * is the web's version of the platform rule that hover effects belong on
     * devices with a pointer, and it also stops the app from repainting a
     * blurred surface for a state a touch device can never be in.
     */
    plugin(({ addVariant }) => {
      addVariant('pointer-hover', ['@media (hover: hover) and (pointer: fine) { &:hover }']);
    }),
  ],
};