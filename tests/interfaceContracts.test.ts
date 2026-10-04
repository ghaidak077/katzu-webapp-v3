import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The interface contracts this batch repaired, pinned so they cannot silently
 * come back.
 *
 * The unit runner has no DOM (`environment: 'node'`), so — like
 * `designSystem.test.ts` and `appMap.test.ts` — these read the real source and
 * assert the structural rule rather than rendering the component. Each case
 * maps to a confirmed defect:
 *
 *  1. a busy `Button` replaced its label with an aria-hidden canvas, so a screen
 *     reader announced only "button" while loading;
 *  2. `Modal`/`BottomSheet` were plain divs: no dialog role, no focus entry, Tab
 *     escaped behind the scrim, Escape did nothing;
 *  3. the overlay scrim's fade was the one transition the reduced-motion block
 *     missed;
 *  4. the FAQ disclosure glyph animated its transform as decoration;
 *  5. the grammar path accepted `onBack` and never rendered it;
 *  6. marketing promised "unlimited, no daily limits" against server quotas and
 *     "no points" against the XP system, and overstated the writing skill;
 *  7. `SiriWave` read the reduced-motion preference once at mount.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Every `.ts`/`.tsx` file under a directory, relative to the repo root. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel.replace(/\\/g, '/'));
  }
  return out;
}

describe('accessible primitives', () => {
  it('a loading Button keeps its accessible name', () => {
    const button = read('src/components/ui/Button.tsx');
    expect(button).toContain('aria-busy=');
    expect(button).toMatch(/isLoading \?[\s\S]*?sr-only[\s\S]*?children/);
  });

  it('Modal and BottomSheet are real dialogs, not bare divs', () => {
    for (const file of ['src/components/ui/Modal.tsx', 'src/components/ui/BottomSheet.tsx']) {
      const src = read(file);
      expect(src, file).toContain("useModalDialog");
      expect(src, file).toContain('role="dialog"');
      expect(src, file).toContain('aria-modal="true"');
      expect(src, file).toContain('tabIndex={-1}');
    }
  });

  it('the dialog hook closes on Escape, traps Tab and restores focus', () => {
    const hook = read('src/components/ui/useModalDialog.ts');
    expect(hook).toContain("event.key === 'Escape'");
    expect(hook).toContain("event.key !== 'Tab'");
    // Focus must be given back to whatever opened the dialog.
    expect(hook).toContain('restoreRef');
  });
});

describe('reduced motion covers overlays and decoration', () => {
  it('the reduced-motion block also stops the scrim fade', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/\.kz-primary,[\s\S]{0,240}?\.kz-scrim \{/);
  });

  it('the FAQ disclosure glyph no longer animates its transform', () => {
    const landing = read('src/features/marketing/LandingScreen.tsx');
    expect(landing).toContain('group-open:rotate-45');
    expect(landing).not.toContain('group-open:rotate-45 transition-transform');
  });

  it('SiriWave reads the preference live instead of once at mount', () => {
    const siri = read('src/components/effects/SiriWave.tsx');
    expect(siri).toContain('useReducedMotion');
    expect(siri).toMatch(/\[variant, size, renderScale, reduceMotion\]/);
    expect(siri).not.toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
  });
});

describe('navigation', () => {
  it('the grammar path screen can be left without the browser button', () => {
    const grammar = read('src/features/grammar/GrammarSectionScreen.tsx');
    expect(grammar).toContain("from '@/components/common/BackButton'");
    expect(grammar).toMatch(/<BackButton onBack=\{onBack\}/);
  });
});

describe('honest marketing copy', () => {
  const SOURCE = walk('src');

  it('never promises unlimited AI turns, no daily limits, or "no points"', () => {
    const banned = ['غير محدودة', 'لا محدودة', 'بدون قيود يومية', 'لا نقاط'];
    const offenders: string[] = [];
    for (const rel of SOURCE) {
      const text = read(rel);
      for (const phrase of banned) {
        if (text.includes(phrase)) offenders.push(`${rel}: ${phrase}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('describes the level range as A0–B2 everywhere levels are listed', () => {
    const files = [
      'src/components/sheets/PaywallModal.tsx',
      'src/features/auth/SubscriptionRedemptionScreen.tsx',
      'src/features/trail/TrailScreen.tsx',
      'src/features/onboarding/OnboardingScreen.tsx',
      'src/features/report/SessionReportScreen.tsx',
      'src/features/conversation/useLiveConversation.ts',
    ];
    for (const file of files) {
      const src = read(file);
      expect(src, file).toContain('A0');
      expect(src, file).not.toContain('A1 إلى B2');
    }
  });

  it('does not claim writing alone determines the certificate', () => {
    expect(read('src/features/writing/WritingScreen.tsx')).not.toContain('تُحدد الشهادة');
  });
});

describe('layout and resource honesty', () => {
  it('the app shell clips decorative bleed so no glow can widen the document', () => {
    // Measured before the fix: an ambient BorderBeam halo (`inset: -30px`) pushed
    // /app/trail and /dev/system to scrollWidth 325 at a 320px viewport.
    expect(read('src/App.tsx')).toContain('overflow-x-clip');
  });

  it('the hero-video slot only activates for a real video, not the SPA fallback', () => {
    // A dev/preview server answers an unknown asset path with index.html and 200,
    // so `res.ok` alone would treat a missing video as present.
    const landing = read('src/features/marketing/LandingScreen.tsx');
    expect(landing).toContain("startsWith('video/')");
    expect(landing).not.toMatch(/alive && res\.ok\) setSrc/);
  });
});
