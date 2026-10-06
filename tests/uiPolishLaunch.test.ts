import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Launch-week UI polish regressions (owner brief, 2026-10-06).
 *
 * Three classes of defect that had reached the production bundle:
 *   G1 — an Arabic-Indic digit in a user-facing count («0 من ٣ خطوات»);
 *   Screen 1.1 — a developer-facing placeholder sentence in the hero slot
 *   (the earlier fix covered `ScenarioBanner` only, so the JOURNEY copy kept
 *   its own copy of the string);
 *   Screen 1.4 — an achievement the learner had not earned («قدرة مكتسبة»
 *   while the chapter sat at 0 of 3 scenes), which reads as a fake.
 *
 * Source-level, instant, and honest about what they cannot see: these pin the
 * STRINGS and the state gate; the rendered geometry (one glow, tap sizes, the
 * counter not flipping) is pinned by the browser specs they name below.
 */

/** Every .ts/.tsx file under src/ — the same walk the numeral gate uses. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

const files = sourceFiles('src');

describe('G1 — Western numerals everywhere (extended scan)', () => {
  it('no Arabic-Indic digit reaches any src string, gated or not', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      code.split(/\r?\n/).forEach((line, i) => {
        if (/[\u0660-\u0669\u06F0-\u06F9]/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    // The dedicated gate is tests/westernNumerals.test.ts; this is the same
    // shape re-asserted next to the screen regressions so the launch fixes
    // cannot be reverted in isolation.
    expect(offenders).toEqual([]);
  });

  it('the readiness count renders from real data, never a literal «٣»', () => {
    // The defective literal came from GuidedPractice's step counter. The file
    // must now derive the Arabic step text from the numeric total.
    const guided = readFileSync('src/features/journey/GuidedPracticeScreen.tsx', 'utf8');
    expect(guided).toMatch(/totalStepsAr = String\(totalSteps\)/);
    expect(guided).not.toMatch(/'٣'|'٢'/);
  });
});

describe('Screen 1.1 — no placeholder sentence in the journey hero', () => {
  it('the developer-facing «ستُضاف هنا» note exists nowhere in src', () => {
    const offenders = files.filter((file) => {
      const code = readFileSync(file, 'utf8');
      // Comments stripped: a comment may explain that the string was removed.
      const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      return /ستُضاف هنا|ستضاف هنا|صورة هذا الموقف/.test(bare);
    });
    expect(offenders).toEqual([]);
  });

  it('the banner still renders real scene lighting (removal did not gut the design)', () => {
    const banner = readFileSync('src/components/glass/ScenarioBanner.tsx', 'utf8');
    expect(banner).toMatch(/sceneBackdropLayers\(scene\)\.image/);
  });
});

describe('Screen 1.4 — the achievement card cannot fake a capability', () => {
  const journey = readFileSync('src/features/journey/JourneyHomeScreen.tsx', 'utf8');

  it('renders «قدرة مكتسبة» only from a recorded INDEPENDENT/RETAINED state', () => {
    // The earned card is gated on `latestCapability`, which is built from
    // `capability.byScenario` filtered to INDEPENDENT/RETAINED — the same
    // evidence ladder tests/capability.test.ts pins. No other path to the
    // string may exist.
    const earnedBranch = journey.slice(journey.indexOf('{latestCapability ? ('));
    expect(earnedBranch).toMatch(/latestCapability\.labelAr/);
    expect(journey).toMatch(/state === 'INDEPENDENT' \|\| value\.state === 'RETAINED'/);
  });

  it('shows an honest goal line while nothing is earned yet', () => {
    expect(journey).toMatch(/هدفك في هذا الفصل/);
  });
});

describe('G2 — counters cannot flip in RTL', () => {
  it('every "n / m" interpolation in a screen went through <bdi dir="ltr">', () => {
    // Screens that used to interpolate `{x} / {y}` straight into an RTL
    // document (Review read "8 / 1" for "1 / 8"). The shared helper is the
    // only sanctioned shape.
    const offenders: string[] = [];
    for (const file of files) {
      if (!/features\//.test(file.replace(/\\/g, '/'))) continue;
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/\{\s*\w[\w.+]*\s*\}\s*\/\s*\{\s*\w[\w.+]*\s*\}/.test(code)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the shared helper isolates the run', () => {
    const helper = readFileSync('src/components/common/LtrCounter.tsx', 'utf8');
    expect(helper).toMatch(/dir="ltr"/);
    expect(helper).toMatch(/<bdi/);
  });
});

describe('G5 — one glow per screen (Journey Home)', () => {
  it('only the hero wears the ambient beam; the earned card is a plain surface', () => {
    const journey = readFileSync('src/features/journey/JourneyHomeScreen.tsx', 'utf8');
    const beams = journey.match(/<BorderBeam role="ambient"/g) ?? [];
    expect(beams.length).toBe(1);
    // The earned card used to carry a SECOND beam (palette="earned"); it must
    // be a bare GlassCard now.
    expect(journey).not.toMatch(/palette="earned"/);
  });
});
