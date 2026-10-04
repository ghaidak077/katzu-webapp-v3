/**
 * V36 — twenty-six screens used to ship one `document.title`.
 *
 * The unit test pins the map itself, because a route that is added without a
 * title is a route that silently joins the unnamed pile. The browser spec
 * (`e2e/screenNames.spec.ts`) then proves the title actually reaches
 * `document.title` on a real navigation.
 */

import { describe, expect, it } from 'vitest';
import { titleForPath } from '@/App';

/** Every route path the app declares, minus the parameterised ones. */
const DECLARED_ROUTES = [
  '/',
  '/welcome',
  '/signin',
  '/demo',
  '/onboarding',
  '/subscription',
  '/placement',
  '/app/library',
  '/app/grammar',
  '/app/review',
  '/app/listen',
  '/app/write',
  '/app/coach',
  '/app/ask',
  '/app/trail',
  '/app/practice',
  '/app/progress',
  '/app/profile',
  '/session-report',
];

describe('the route title map', () => {
  it('names every declared route, so no screen falls back to the brand alone', () => {
    const unnamed = DECLARED_ROUTES.filter((path) => titleForPath(path) === 'كَاتْزُو');
    expect(unnamed, `these routes have no name of their own: ${unnamed.join(', ')}`).toEqual([]);
  });

  it('gives two different screens two different titles', () => {
    // The defect being fixed was four tabs all reading "Katzu". Distinctness is
    // the whole point, so it is asserted rather than assumed.
    const byTitle = new Map<string, string[]>();
    for (const path of [...DECLARED_ROUTES, '/scenario/cafe_order', '/scenario/cafe_order/quiz']) {
      const title = titleForPath(path);
      byTitle.set(title, [...(byTitle.get(title) ?? []), path]);
    }
    const collisions = [...byTitle.entries()].filter(([, paths]) => paths.length > 1);
    expect(collisions.map(([title, paths]) => `${title}: ${paths.join(' ')}`)).toEqual([]);
  });

  it('reads a trailing slash and an empty path as the landing screen', () => {
    expect(titleForPath('/')).toBe('تعلم الألمانية');
    expect(titleForPath('//')).toBe('تعلم الألمانية');
  });

  it('names each step of the journey loop by its own verb', () => {
    // `/scenario/:id` must not swallow its own sub-routes: the bare-scenario
    // pattern is last, and this is what proves the order survived.
    expect(titleForPath('/scenario/cafe_order/story')).toBe('الموقف');
    expect(titleForPath('/scenario/cafe_order/practice')).toBe('تدريب موجّه');
    expect(titleForPath('/scenario/cafe_order/study')).toBe('جلسة الدراسة');
    expect(titleForPath('/scenario/cafe_order/quiz')).toBe('اختبار سريع');
    expect(titleForPath('/scenario/cafe_order/live')).toBe('المحادثة الحية');
    expect(titleForPath('/scenario/cafe_order')).toBe('المشهد');
  });

  it('does not match a slash that is part of an id', () => {
    // `[^/]+` is deliberate: `/scenario/a/b` is not a route this app serves, so
    // it must not be silently titled as if it were the story step.
    expect(titleForPath('/scenario/a/b')).toBe('كَاتْزُو');
  });
});
