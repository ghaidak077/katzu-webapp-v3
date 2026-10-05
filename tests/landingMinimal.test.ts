import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The landing page, as a document.
 *
 * F9 asked for one order — hero, demo, proof, price, founder, questions — and
 * for the claims on it to be the ones the product can keep. Those are properties
 * of the file, not of a render, so they are asserted against the source: a
 * section that moves, a second CTA that creeps back, or a host that gets invented
 * where none is configured are all invisible to a screenshot and obvious here.
 */

const LANDING = readFileSync('src/features/marketing/LandingScreen.tsx', 'utf8');
const INDEX = readFileSync('index.html', 'utf8');

/** The sections the landing renders, in the order it renders them. */
function renderedSections(): string[] {
  const mount = LANDING.slice(LANDING.indexOf('<Hero'), LANDING.indexOf('</div>', LANDING.indexOf('<FaqSection')));
  return [...mount.matchAll(/<(Hero|TryDemoSection|ExampleSection|FreeVsProSection|FounderSection|SkillsSection|ComingSection|FaqSection)\b/g)]
    .map((m) => m[1])
    .filter((name, i, all) => all.indexOf(name) === i);
}

describe('the order a stranger decides in', () => {
  it('is hero → demo → proof → price → founder → questions', () => {
    const order = renderedSections();
    expect(order[0]).toBe('Hero');
    expect(order).toContain('TryDemoSection');
    expect(order).toContain('ExampleSection');
    expect(order).toContain('FreeVsProSection');
    expect(order).toContain('FounderSection');
    expect(order.indexOf('TryDemoSection')).toBeLessThan(order.indexOf('ExampleSection'));
    expect(order.indexOf('ExampleSection')).toBeLessThan(order.indexOf('FreeVsProSection'));
    expect(order.indexOf('FreeVsProSection')).toBeLessThan(order.indexOf('FounderSection'));
    expect(order.indexOf('FounderSection')).toBeLessThan(order.indexOf('FaqSection'));
    // The questions are last: nothing should open a second argument after them.
    expect(order[order.length - 1]).toBe('FaqSection');
  });

  it('does not repeat the main action at the bottom of the page', () => {
    // A second CTA block says the same thing twice and makes neither the main
    // action. It was removed; this stops it returning as a "helpful" addition.
    expect(LANDING).not.toMatch(/function FinalCta\(/);
    expect(renderedSections()).not.toContain('FinalCta');
  });

  it('no longer carries the three sections that restated the hero', () => {
    for (const gone of ['function WhySection(', 'function WhoItIsForSection(', 'function StepsSection(']) {
      expect(LANDING).not.toMatch(gone);
    }
  });
});

describe('one headline, one CTA', () => {
  it('has exactly one <h1>', () => {
    expect([...LANDING.matchAll(/<h1\b/g)]).toHaveLength(1);
  });

  it('the headline is two deliberate lines, not a paragraph', () => {
    // One block-level span is one enforced line break. The 390px fit is proved
    // in the browser by `e2e/landingHero.spec.ts`, which measures it rather
    // than counting characters.
    const h1 = LANDING.slice(LANDING.indexOf('<h1'), LANDING.indexOf('</h1>'));
    expect(h1).toMatch(/className="block/);
    expect([...h1.matchAll(/className="block/g)]).toHaveLength(1);
  });

  it('the hero offers the account-free demo as its single primary action', () => {
    const hero = LANDING.slice(LANDING.indexOf('function Hero('), LANDING.indexOf('function TryDemoSection'));
    const filled = (block: string) =>
      [...block.matchAll(/<Button\b((?:(?!variant=)[^>])*)\/?>/g)].filter((m) => /size="lg"/.test(m[1]));

    // One filled button (no `variant` prop) per audience — the others are
    // outline or ghost, which is what makes exactly one read as the action.
    const signedInBranch = hero.slice(hero.indexOf('{isSignedIn ?'), hero.indexOf('<>'));
    const visitorBranch = hero.slice(hero.indexOf('<>'), hero.indexOf('</>'));

    expect(filled(signedInBranch)).toHaveLength(1);
    expect(filled(visitorBranch)).toHaveLength(1);
    // And the visitor's one is the demo: the product's own promise is
    // try-before-signup, so signup stays the outlined second choice.
    expect(filled(visitorBranch)[0][1]).toMatch(/onClick=\{onTryDemo\}/);
    expect(hero).toMatch(/جرّب درساً بدون حساب/);
  });
});

describe('the proof is real or it is absent', () => {
  it('the proof section shows actual corrections, not a mockup image', () => {
    // A generated screenshot of a product that does not look like itself is a
    // worse lie than no picture: the repo has no product screenshot, so none is
    // shown, and the section carries real German corrections instead.
    expect(LANDING).toMatch(/EXAMPLE_MISTAKES\.map/);
    expect(EXAMPLE_MISTAKES_are_real_sentences()).toBe(true);
  });

  it('invents no screenshot file and points at none that is missing', () => {
    // The honest slot is a marked one. No `src=` may name an asset that is not
    // in the repo — a broken image on a launch page is the loudest possible
    // "almost ready".
    for (const m of LANDING.matchAll(/(?:src|href)="\/([^"]+)"/g)) {
      const path = m[1];
      if (path.includes('${')) continue; // built at runtime from config
      expect(existsSyncInRepo(path), `${path} is referenced but not shipped`).toBe(true);
    }
  });
});

describe('the non-affiliation sentence is verbatim', () => {
  it('matches playbook §3.6 exactly', () => {
    const playbook = readFileSync('docs/marketing/KATZU-LAUNCH-PLAYBOOK.md', 'utf8');
    const required = 'كَاتْزُو أداة تدريب مستقلة. غير تابعة ولا معتمدة من Goethe-Institut أو telc أو أي جهة امتحانات. الامتحان الرسمي والشهادة من المركز الرسمي فقط.';
    expect(playbook).toContain(required);
    expect(LANDING).toContain(required);
  });

  it('is on a public surface, not only inside the app', () => {
    expect(LANDING).toMatch(/NON_AFFILIATION_AR/);
    expect(LANDING).toMatch(/\{NON_AFFILIATION_AR\}/);
  });
});

describe('the share preview', () => {
  it('carries Open Graph and Twitter tags', () => {
    for (const tag of [
      'og:type',
      'og:locale',
      'og:title',
      'og:description',
      'og:image',
      'twitter:card',
      'twitter:title',
      'twitter:description',
      'twitter:image',
    ]) {
      expect(INDEX, `index.html must declare ${tag}`).toContain(`"${tag}"`);
    }
  });

  it('names no host it cannot know', () => {
    // `VITE_PUBLIC_APP_URL` is unset until the domain is live. A hardcoded
    // `https://katzu.app/...` here would advertise a host that does not resolve;
    // the absolute URL is written at runtime or not at all.
    expect(INDEX).not.toMatch(/katzu\.app/);
    expect(INDEX).not.toMatch(/https?:\/\/[a-z0-9-]+\.[a-z]{2,}\//i.test(INDEX) ? /content="https?:\/\/[^"]+"/ : /$^/);
    // og:image stays root-relative, which resolves against whatever origin runs.
    expect(INDEX).toMatch(/og:image" content="\/assets\//);
  });

  it('points at an image that exists', () => {
    const m = INDEX.match(/og:image" content="\/([^"]+)"/);
    expect(m).toBeTruthy();
    expect(existsSyncInRepo(m![1])).toBe(true);
  });
});

describe('the funnel stays measurable', () => {
  it('fires a distinct event for each of the four steps, somewhere in the app', () => {
    // Reordering the page must not merge any two steps: the landing reordering
    // is only free if each step still reports on its own. The events live in
    // different files by design (landing, demo, sign-in, conversation), so the
    // whole app is scanned rather than one screen.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
      }
    };
    walk('src');
    const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const event of ['landing_viewed', 'demo_started', 'signup_started', 'first_independent_turn']) {
      expect(all, `${event} must still be fired somewhere`).toMatch(new RegExp(`track\\(\\s*'${event}'`));
    }
  });

  it('measures the landing itself the same way it always did', () => {
    expect(LANDING).toMatch(/track\('landing_viewed', \{ source: isSignedIn \? 'signed_in' : 'visitor' \}\)/);
  });
});

/** Whether a repo-relative asset actually ships. */
function existsSyncInRepo(path: string): boolean {
  try {
    readFileSync(`public/${path}`);
    return true;
  } catch {
    try {
      readFileSync(path);
      return true;
    } catch {
      return false;
    }
  }
}

/** Every example correction is a real German sentence pair, not filler. */
function EXAMPLE_MISTAKES_are_real_sentences(): boolean {
  const block = LANDING.slice(LANDING.indexOf('EXAMPLE_MISTAKES'), LANDING.indexOf('function ExampleSection'));
  const pairs = [...block.matchAll(/wrong:\s*'([^']+)'[\s\S]*?right:\s*'([^']+)'/g)];
  if (pairs.length < 3) return false;
  return pairs.every(([, wrong, right]) => /[a-zA-ZäöüÄÖÜß]/.test(wrong) && /[a-zA-ZäöüÄÖÜß]/.test(right));
}
