import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * V34 — the Apple-polish and performance contract.
 *
 * Three things went wrong in this app that a screenshot would never catch and a
 * unit test is the only honest place to pin:
 *
 *  1. **Motion that follows a pointer.** `useSpecularHighlight` moved every
 *     surface's light with the mouse and the scroll position. Measured on the
 *     production bundle: 969 ms of style recalculation per 200 pointer moves on
 *     Journey Home, and 100 ms of it in five idle seconds. A phone has no
 *     pointer to follow, so the whole cost bought nothing.
 *  2. **An always-on animation driver.** The ambient `BorderBeam` ran a shared
 *     30 fps rAF loop rewriting seventeen custom properties per beam, forever,
 *     to breathe a decorative glow. Same measurement: it was most of the idle
 *     cost on the one screen that carries it.
 *  3. **A radius ladder with a private copy.** `.kz-primary` declared 22px
 *     while the secondary button beside it used the named `control` step (20px)
 *     — two neighbouring controls, two pixels apart.
 *
 * These read the real files, so the fixes cannot quietly come back.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const indexCss = read('src/index.css');
const tailwindConfig = read('tailwind.config.js');
const glassSurface = read('src/components/glass/GlassSurface.tsx');
const journeyHome = read('src/features/journey/JourneyHomeScreen.tsx');
const beamCss = read('src/components/effects/borderBeamCss.ts');
const borderBeam = read('src/components/effects/BorderBeam.tsx');
const button = read('src/components/ui/Button.tsx');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}

/**
 * Source with prose and reviewed exemptions removed — the same two escapes
 * `scripts/design-audit.mjs` offers, so this suite and that gate can never
 * disagree about what "code" means.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.includes('design-audit: allow'))
    .join('\n')
    .replace(/^\s*\/\/.*$/gm, '');
}

const sourceFiles = walk(join(ROOT, 'src'));

describe('pointer motion is gone, not merely disabled', () => {
  it('has no hook that follows the pointer', () => {
    expect(glassSurface, 'useSpecularHighlight is retired; the surface is lit from a fixed direction').not.toContain(
      'useSpecularHighlight',
    );
    expect(glassSurface).not.toContain('SpecularHighlight');
    expect(glassSurface).not.toContain('getBoundingClientRect');
  });

  it('renders no specular layer per surface', () => {
    // The layer existed only to carry the pointer-driven highlight, and every
    // GlassSurface on the screen paid for one extra node.
    expect(glassSurface).not.toContain('kz-specular');
    expect(indexCss).not.toContain('.kz-specular');
  });

  it('attaches no pointer handler to the Journey Home root', () => {
    expect(journeyHome).not.toContain('onPointerMove');
    expect(journeyHome).not.toContain('onMouseMove');
  });

  it('keeps the light direction as a fixed token, declared once', () => {
    for (const token of ['--kz-spec-x', '--kz-spec-y', '--kz-spec-strength']) {
      const hits = indexCss.match(new RegExp(`${token}:`, 'g')) ?? [];
      expect(hits, `${token} is declared ${hits.length} times`).toHaveLength(1);
    }
    // A token nothing writes is a static light direction, which is the point.
    expect(code(beamCss) + code(button) + code(glassSurface)).not.toContain('--kz-spec-x');
  });
});

describe('hover only exists where there is a pointer', () => {
  it('compiles hover under a real-pointer media query', () => {
    expect(tailwindConfig).toContain('addVariant(\'pointer-hover\'');
    expect(tailwindConfig).toContain('@media (hover: hover) and (pointer: fine) { &:hover }');
  });

  it('leaves no bare hover: class anywhere in the app', () => {
    const offenders = sourceFiles.filter((file) =>
      /(?<![-\w])hover:/.test(code(readFileSync(join(ROOT, file), 'utf8'))),
    );
    expect(offenders, `bare hover: in ${offenders.join(', ')}`).toEqual([]);
  });

  it('gates the scrollbar thumb the same way', () => {
    const thumb = indexCss.slice(indexCss.indexOf('::-webkit-scrollbar-thumb'));
    expect(thumb).toContain('@media (hover: hover) and (pointer: fine)');
  });
});

describe('the ambient beam is painted, not driven', () => {
  it('has no animation driver left in the beam layer', () => {
    expect(beamCss).not.toContain('requestAnimationFrame');
    expect(beamCss).not.toContain('setProperty');
    expect(beamCss).not.toContain('attachPulse');
    expect(beamCss).not.toContain('buildPulseConfig');
    expect(borderBeam).not.toContain('attachPulse');
  });

  it('keeps one short fade as the only ambient animation', () => {
    // The material should arrive, not snap on — and then be still.
    const ambient = beamCss.slice(
      beamCss.indexOf('function pulseOutsideCss'),
      beamCss.indexOf('function lineCss'),
    );
    const infinite = ambient.match(/infinite/g) ?? [];
    expect(infinite, 'the ambient role must not loop').toHaveLength(0);
    expect(ambient).toContain('rim-fade-in-${id} 600ms ease forwards');
  });

  it('leaves the travelling comet — motion on a control the learner is holding', () => {
    expect(beamCss.slice(beamCss.indexOf('function lineCss'))).toContain('rim-travel-${id}');
  });

  it('runs an IntersectionObserver only for the role that still moves', () => {
    expect(borderBeam).toContain("if (variant !== 'line') return;");
  });
});

describe('one corner ladder', () => {
  const LADDER = ['tag', 'chip', 'control', 'panel', 'sheet', 'hero'];

  it.each(LADDER)('declares --kz-radius-%s once, in the token file', (step) => {
    const hits = indexCss.match(new RegExp(`--kz-radius-${step}:`, 'g')) ?? [];
    expect(hits, `--kz-radius-${step} must be declared exactly once`).toHaveLength(1);
  });

  it('has Tailwind read the ladder rather than copy it', () => {
    for (const step of ['tag', 'chip', 'control', 'panel', 'sheet']) {
      expect(tailwindConfig, `borderRadius.${step} must read --kz-radius-${step}`).toContain(
        `radius('${step}')`,
      );
    }
    expect(tailwindConfig).toContain("radius = (name) => `var(--kz-radius-${name})`");
  });

  it('expresses no bare pixel radius in the stylesheet', () => {
    // `inherit`, the ladder, and the two pills are the whole legal vocabulary.
    const offenders = [...code(indexCss).matchAll(/border-radius:\s*([^;]+);/g)]
      .map((m) => m[1].trim())
      .filter((value) => !/inherit|9999px|var\(--kz-radius-|var\(--kz-glass-radius\)/.test(value));
    expect(offenders, `one-off radii: ${offenders.join(', ')}`).toEqual([]);
  });

  it('keeps the glass surface on the sheet step', () => {
    expect(indexCss).toContain('--kz-glass-radius: var(--kz-radius-sheet)');
  });

  it('gives the primary button the same radius as its neighbours', () => {
    const primary = indexCss.slice(indexCss.indexOf('.kz-primary {'));
    expect(primary.slice(0, primary.indexOf('}'))).toContain(
      'border-radius: var(--kz-radius-control)',
    );
    // And the secondary button really is that step.
    expect(button).toContain('rounded-control');
  });
});

describe('the material answers the accessibility switches', () => {
  it('honours reduced transparency without losing contrast', () => {
    const block = indexCss.slice(indexCss.indexOf('@media (prefers-reduced-transparency: reduce)'));
    expect(block.slice(0, 1200)).toContain('backdrop-filter: none');
    expect(block.slice(0, 1200)).toContain('--kz-glass-opacity: 0.9');
  });

  it('honours prefers-contrast with a defined edge, not a tint', () => {
    const block = indexCss.slice(indexCss.indexOf('@media (prefers-contrast: more)'));
    expect(block.slice(0, 800)).toContain('--kz-glass-edge: 0.5');
  });

  it('keeps positive tracking off the Arabic scale', () => {
    // Arabic is cursive: letter-spacing pulls joined letters apart, so only the
    // Latin steps may take a positive value.
    const arabic = indexCss.slice(indexCss.indexOf('.kz-ar-display'), indexCss.indexOf('.kz-de-display'));
    const positives = arabic.match(/letter-spacing:\s*0?\.\d+em/g) ?? [];
    const allowed = positives.filter((v) => Number.parseFloat(v.replace(/[^\d.]/g, '')) <= 0);
    expect(allowed.length, `positive Arabic tracking found: ${positives.join(', ')}`).toBe(positives.length);
  });
});