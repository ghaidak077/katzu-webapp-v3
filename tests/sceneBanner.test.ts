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
    // mean "no artwork", never `src=""`.
    for (const bannerUrl of ['', '   ', null, undefined]) {
      const scene = sceneFor({ id: 'bakery_shopping', category: 'food', bannerUrl });
      expect(scene.artUrl, `banner_url: ${JSON.stringify(bannerUrl)}`).toBe(
        'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=640&h=360&q=60',
      );
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
    expect(scene.artUrl).toBe(
      'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=640&h=360&q=60',
    );
  });

  it('asks for the size the column renders, not a retina poster', () => {
    // Measured before this: 235,739 bytes for a 1200px placeholder; 63,113 bytes at
    // 640×360 for the same picture. These thumbnails render at 448px wide.
    const everyArt = [
      sceneFor({ id: 'cafe_order' }).artUrl,
      sceneFor({ id: 'train_station' }).artUrl,
      sceneFor({ id: 'x', category: 'work' }).artUrl,
    ];
    for (const url of everyArt) {
      expect(url).toMatch(/[?&]w=640&h=360/);
    }
  });

  it('returns no artwork at all rather than a broken source', () => {
    // The banner component renders its own honest placeholder for this, which is
    // why the field is optional instead of a guaranteed string.
    const scene = sceneFor({ id: 'unknown_scenario', category: 'unknown_category' });
    expect(scene.artUrl).toBeUndefined();
    expect(scene.locationAr).toBe('في ألمانيا');
  });
});
