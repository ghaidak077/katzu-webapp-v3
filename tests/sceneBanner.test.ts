import { describe, expect, it } from 'vitest';
import { sceneFor } from '@/lib/design/scenes';

/**
 * Which 16:9 artwork a scenario gets.
 *
 * The order matters more than it looks: `banner_url` is the column the owner
 * writes from the content editor, and it has to win over the built-in
 * placeholders — otherwise editing a banner in the admin panel would appear to
 * work and change nothing on screen. The floor matters as much: a scenario with no
 * artwork, or with a half-typed one, must still get a real 16:9 visual rather than
 * an empty `src` the browser renders as a broken frame.
 */
describe('sceneFor artwork', () => {
  it('uses the scenario’s own banner, ahead of every placeholder', () => {
    const scene = sceneFor({ id: 'cafe_order', category: 'food', bannerUrl: 'https://cdn.katzu.app/a.png' });
    expect(scene.artUrl).toBe('https://cdn.katzu.app/a.png');
  });

  it('trims the value it is given, because it comes from a content form', () => {
    const scene = sceneFor({ id: 'cafe_order', bannerUrl: '  https://cdn.katzu.app/b.png  ' });
    expect(scene.artUrl).toBe('https://cdn.katzu.app/b.png');
  });

  it('falls back to the built-in art when the column is empty or whitespace', () => {
    // An empty string is what a form submits when the field is cleared, and it must
    // mean "no artwork", never `src=""`. Since B4b the floor is a local file from
    // public/scenes/ — precached, no remote origin.
    for (const bannerUrl of ['', '   ', null, undefined]) {
      const scene = sceneFor({ id: 'bakery_shopping', category: 'food', bannerUrl });
      expect(scene.artUrl, `banner_url: ${JSON.stringify(bannerUrl)}`).toBe('/scenes/bakery_shopping.jpg');
    }
  });

  it('prefers the scenario’s placeholder over its category’s', () => {
    // Two food-category scenarios must not share one picture: the learner reads the
    // thumbnail to recognise the situation, and identical art defeats that.
    const cafe = sceneFor({ id: 'cafe_order', category: 'food' });
    const bakery = sceneFor({ id: 'bakery_shopping', category: 'food' });
    expect(cafe.artUrl).not.toBe(bakery.artUrl);
  });

  it('gives an unknown scenario its category art', () => {
    const scene = sceneFor({ id: 'not_in_the_catalogue', category: 'official' });
    expect(scene.artUrl).toBe('/scenes/official.jpg');
  });

  it('every art source is a local file from public/scenes/', () => {
    // B4b contract: no remote placeholder origins. banner_url may be any URL the
    // owner sets, but the built-in floor must always be local.
    const ids = ['cafe_order', 'bakery_shopping', 'doctor_visit', 'apartment_viewing', 'job_interview', 'train_station'];
    const categories = ['travel', 'housing', 'work', 'official', 'health', 'food', 'daily_life'];
    for (const id of ids) expect(sceneFor({ id }).artUrl).toMatch(/^\/scenes\//);
    for (const category of categories) expect(sceneFor({ id: 'x', category }).artUrl).toMatch(/^\/scenes\//);
  });

  it('returns no artwork at all rather than a broken source', () => {
    // The banner component renders its own honest placeholder for this, which is
    // why the field is optional instead of a guaranteed string.
    const scene = sceneFor({ id: 'unknown_scenario', category: 'unknown_category' });
    expect(scene.artUrl).toBeUndefined();
    expect(scene.locationAr).toBe('في ألمانيا');
  });
});
