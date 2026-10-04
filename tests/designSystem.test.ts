import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The design system's contract, enforced in CI.
 *
 * The drift audit (`scripts/design-audit.mjs`) and the contrast check
 * (`scripts/contrast-check.mjs`) catch individual violations. These tests
 * catch the *structural* faults that would let a second palette, a missing
 * token or a broken alias creep back in unnoticed:
 *
 *  1. every token Tailwind references actually exists in `src/index.css`;
 *  2. the legacy colour names and the `kz-*` names resolve to the *same*
 *     variables — the unification itself, asserted;
 *  3. the type, radius and hit-target scales are complete;
 *  4. every declared pairing clears WCAG.
 *
 * These read the real files rather than a copy, so a palette change that
 * forgets Tailwind (or the reverse) fails here rather than in a screenshot.
 */

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8');
const config = readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8');

/** Declared `--kz-*` tokens, with their values. */
const tokens = new Map<string, string>();
for (const m of css.matchAll(/--kz-[a-z-]+:\s*([^;]+);/g)) {
  tokens.set(m[0].slice(2, m[0].indexOf(':')), m[1].trim());
}

/** `token('kz-lavender')` calls in the Tailwind config. */
const referenced = [...config.matchAll(/token\('(kz-[a-z-]+)'\)/g)].map((m) => m[1]);
const referencedSet = [...new Set(referenced)];

/**
 * Resolves a token to RGB. The palette declares triplets (`180 160 255`) so
 * that alpha compositing needs only one declaration, but the three foundation
 * blacks are plain hex — both forms are legal, and both must resolve.
 */
function triplet(name: string): [number, number, number] {
  const raw = tokens.get(name);
  expect(raw, `token --${name} must be declared in src/index.css`).toBeDefined();
  const value = (raw as string).trim();

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    expect(full, `--${name} must be a valid hex colour`).toMatch(/^[0-9a-fA-F]{6}$/);
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }

  const parts = value.split(/\s+/);
  expect(parts, `--${name} must be a space-separated RGB triplet`).toHaveLength(3);
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

function luminance(name: string): number {
  const [r, g, b] = triplet(name);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('design tokens', () => {
  it('declares every token Tailwind references', () => {
    const missing = referencedSet.filter((name) => !tokens.has(name));
    expect(missing, `Tailwind references tokens missing from src/index.css: ${missing.join(', ')}`).toEqual(
      [],
    );
  });

  it('references tokens from the config rather than re-declaring hex values', () => {
    // A hex literal in the colour block is a second palette waiting to happen.
    const colorsBlock = config.slice(config.indexOf('colors:'), config.indexOf('fontSize:'));
    const hexInColors = [...colorsBlock.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(
      hexInColors,
      'tailwind.config.js must reference CSS variables, not declare colours',
    ).toEqual([]);
  });
});

describe('palette unification', () => {
  /**
   * The whole point of the refactor: a screen saying `text-primary` and one
   * saying `text-kz-lavender` must paint the same colour. If either name ever
   * points at its own hex again, the app has two palettes.
   */
  it.each([
    ['primary', 'kz-lavender'],
    ['status.success', 'kz-neon'],
    ['status.learning', 'kz-warm'],
    ['status.error', 'kz-danger'],
    ['text.primary', 'kz-ink'],
    ['text.secondary', 'kz-ink-dim'],
    ['text.muted', 'kz-ink-faint'],
    ['border.subtle', 'kz-line'],
    ['article.der', 'kz-cool'],
    ['article.das', 'kz-neon'],
    ['fill.DEFAULT', 'kz-lavender-deep'],
  ])('maps legacy %s onto --%s', (legacyPath, tokenName) => {
    const leaf = legacyPath.split('.').pop() as string;
    const group = legacyPath.split('.')[0];
    // Both spellings must resolve through the same `token('kz-…')` call.
    const legacyUse = new RegExp(`${group}:?[^}]*?${leaf}:\\s*token\\('${tokenName}'\\)`).test(config);
    const kzUse = config.includes(`token('${tokenName}')`);
    expect(legacyUse || kzUse, `no Tailwind colour maps ${legacyPath} onto --${tokenName}`).toBe(true);
    expect(tokens.has(tokenName)).toBe(true);
  });
});

describe('scales', () => {
  it('exposes the five-step type scale', () => {
    for (const step of ['display', 'title', 'body', 'caption', 'micro']) {
      expect(config, `fontSize.${step} must be on the scale`).toContain(`${step}: [`);
    }
    for (const step of ['display', 'title', 'body', 'caption', 'micro']) {
      expect(tokens.has(`kz-ar-${step}`)).toBe(true);
    }
  });

  it('names every radius so a chip, control and sheet cannot disagree', () => {
    // V34: the ladder moved into src/index.css and Tailwind reads it, so the
    // assertion is now the stronger one — the same value, declared once.
    for (const step of ['chip', 'control', 'panel', 'sheet', 'tag']) {
      expect(config, `borderRadius.${step} must read the token`).toContain(`radius('${step}')`);
      expect(tokens.has(`kz-radius-${step}`), `--kz-radius-${step} must be declared in src/index.css`).toBe(
        true,
      );
    }
  });

  it('compiles hover only under a real-pointer media query', () => {
    // V34. A bare `hover:` on a phone leaves the last-tapped control looking
    // selected; `pointer-hover:` is the same rule scoped to devices that have a
    // pointer to hover with.
    expect(config).toContain("addVariant('pointer-hover'");
    expect(config).toContain('@media (hover: hover) and (pointer: fine)');
  });

  it('keeps the 44px thumb-target floor available', () => {
    expect(config).toMatch(/minHeight:\s*\{[^}]*touch:\s*'44px'/);
    expect(config).toMatch(/minWidth:\s*\{[^}]*touch:\s*'44px'/);
  });
});

describe('accessibility', () => {
  const CANVAS = 'kz-soft-black';
  const WELL = 'kz-near-black';

  it.each([
    ['kz-ink', CANVAS, 'primary text on the app background'],
    ['kz-ink-dim', CANVAS, 'secondary text on the app background'],
    ['kz-ink-faint', CANVAS, 'muted text on the app background'],
    ['kz-ink-faint', WELL, 'muted text on a well'],
    ['kz-lavender', CANVAS, 'accent text on the app background'],
    ['kz-lavender', WELL, 'accent text on a well'],
    ['kz-magenta', CANVAS, 'earned text on the app background'],
    ['kz-warm', CANVAS, 'warning text'],
    ['kz-neon', CANVAS, 'success text'],
    ['kz-cool', CANVAS, 'info text'],
  ])('%s on %s clears 4.5:1 — %s', (fg, bg) => {
    const ratio = contrast(fg, bg);
    expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(2)}:1, below the 4.5:1 body-text floor`).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it.each([
    ['kz-on-fill', 'kz-lavender-deep', 'primary button label'],
    ['kz-on-fill', 'kz-lavender-press', 'pressed button label'],
    ['kz-on-danger', 'kz-danger', 'destructive button label'],
  ])('%s on %s clears 4.5:1 — %s', (fg, bg) => {
    const ratio = contrast(fg, bg);
    expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['kz-lavender', CANVAS, 'primary control edge'],
    ['kz-lavender', WELL, 'primary control edge on a well'],
    ['kz-line-strong', CANVAS, 'interactive control edge'],
  ])('%s on %s clears the 3:1 non-text floor — %s', (fg, bg) => {
    const ratio = contrast(fg, bg);
    expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(2)}:1, below 3:1`).toBeGreaterThanOrEqual(3);
  });
});

/* ------------------------------------------------------------------------ *
 * One hue family.                                                          *
 *                                                                          *
 * The palette used to carry five rose-family values (magenta, magenta-deep, *
 * tertiary, tertiary.container, article.die) at OKLCH hue 339-344 — roughly *
 * 50 degrees off the lavender the app is built on. The result read as two   *
 * products stitched together. Hue is the one property the old audit could    *
 * not see, because every value was a "valid" token, so it is asserted here. *
 * ------------------------------------------------------------------------ */

/** OKLCH hue in degrees, 0-360. */
function hue(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(channel) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const deg = (Math.atan2(bb, a) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

/** Tokens that carry the brand's chromatic identity. */
const BRAND_HUE_TOKENS = [
  'kz-lavender',
  'kz-lavender-deep',
  'kz-lavender-press',
  'kz-magenta',
  'kz-magenta-deep',
  'kz-line-strong',
];

describe('motion scale', () => {
  const MOTION = [
    'kz-dur-fast',
    'kz-dur',
    'kz-dur-panels',
    'kz-ease-spring',
    'kz-ease-out',
  ] as const;

  it.each(MOTION)('Tailwind reads --%s rather than copying its value', (name) => {
    expect(config, `tailwind.config.js must reference --${name}, not redeclare it`).toContain(
      `var(--${name})`,
    );
    expect(tokens.has(name), `--${name} must be declared in src/index.css`).toBe(true);
  });

  it.each(MOTION)('--%s is declared exactly once', (name) => {
    const hits = css.match(new RegExp(`--${name}:`, 'g')) ?? [];
    expect(hits, `--${name} is declared ${hits.length} times; a shadowed token is a trap`).toHaveLength(1);
  });

  it('keeps every duration inside the 300ms UI budget', () => {
    for (const [name, value] of tokens) {
      if (!name.startsWith('kz-dur')) continue;
      const ms = Number(String(value).replace(/ms$/, '').trim());
      expect(Number.isFinite(ms), `--${name} = "${value}" is not a millisecond value`).toBe(true);
      expect(ms, `--${name} is ${ms}ms, past the 300ms UI budget`).toBeLessThanOrEqual(300);
    }
  });

  it('retires the over-budget --kz-dur-slow rather than leaving it declared', () => {
    expect(css, '--kz-dur-slow is retired, not merely unused').not.toContain('--kz-dur-slow');
    expect(config).not.toContain('kz-dur-slow');
  });

  it('leaves no hardcoded Tailwind duration behind', () => {
    // `duration-[Nms]` and `duration-NNN` both bypass the ladder. The only legal
    // literal forms are the ones Tailwind itself defines.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.tsx')) {
          for (const m of readFileSync(full, 'utf8').matchAll(/(?<![-\w])duration-(?!fast\b|slow\b|panels\b)[\w[\]]+/g)) {
            offenders.push(`${full.replace(/\\/g, '/')}: ${m[0]}`);
          }
        }
      }
    };
    walk(join(ROOT, 'src'));
    expect(offenders, `hardcoded durations bypass the motion ladder:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('one hue family', () => {
  it.each(BRAND_HUE_TOKENS)('%s stays in the violet arc, never the rose band', (name) => {
    const h = hue(triplet(name));
    // 320-360 is rose/pink. 260-320 is violet. The brand is violet.
    const inRose = h >= 320 || h < 5;
    expect(inRose, `--${name} is at hue ${h.toFixed(0)}deg, which is rose, not Katzu violet`).toBe(false);
    expect(h, `--${name} at hue ${h.toFixed(0)}deg has left the violet arc`).toBeGreaterThan(255);
  });

  it('keeps earned within 15 degrees of the accent it is a sibling of', () => {
    const base = hue(triplet('kz-lavender-deep'));
    const earned = hue(triplet('kz-magenta'));
    const delta = Math.min(Math.abs(base - earned), 360 - Math.abs(base - earned));
    expect(delta, `earned is ${delta.toFixed(1)}deg from the accent — that is a second brand`).toBeLessThanOrEqual(
      15,
    );
  });

  it('keeps the canvas-side colour copies pinned to their tokens', () => {
    const magenta = triplet('kz-magenta');
    const deep = triplet('kz-magenta-deep');
    const lavender = triplet('kz-lavender');

    const beam = readFileSync(join(ROOT, 'src/components/effects/borderBeamCss.ts'), 'utf8');
    const orb = readFileSync(join(ROOT, 'src/components/voice/KatzuOrb.tsx'), 'utf8');
    const presence = readFileSync(join(ROOT, 'src/components/v2/KatzuPresence.tsx'), 'utf8');

    // borderBeamCss earned palette
    expect(beam).toContain(`base: { r: ${magenta[0]}, g: ${magenta[1]}, b: ${magenta[2]} }`);
    expect(beam).toContain(`deep: { r: ${deep[0]}, g: ${deep[1]}, b: ${deep[2]} }`);
    expect(beam).toContain(`base: { r: ${lavender[0]}, g: ${lavender[1]}, b: ${lavender[2]} }`);
    // KatzuOrb canvas constants
    expect(orb).toContain(`[${magenta.join(', ')}]`);
    expect(orb).toContain(`[${lavender.join(', ')}]`);
    // KatzuPresence drop-shadow
    expect(presence).toContain(`rgba(${magenta.join(',')},0.42)`);
    // Tailwind's earned shadow
    expect(config).toContain(`rgba(${magenta.join(', ')}, 0.30)`);
    expect(config).toContain(`rgba(${deep.join(', ')}, 0.30)`);
  });
});