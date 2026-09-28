/**
 * Cinematic scene lighting, derived from content — not hardcoded per screen.
 *
 * Every mission happens somewhere in Germany, and that somewhere has its own
 * light: a station at night is amber and sodium-yellow, a doctor's office is a
 * cold fluorescent blue, a café is warm gold. The UI glass adapts to that light
 * (`--kz-scene-rgb`), which is what stops the mission card from looking identical
 * over a warm scene and a cool one.
 *
 * Artwork: every scene ships a **local** image from `public/scenes/` — soft
 * two-tone gradients keyed to the same palette this module uses for lighting.
 * B4b replaced the previous remote Unsplash hotlinks (network dependency,
 * offlined badly, and a third-party origin on every scenario card) with these;
 * they are honest placeholders in the strongest sense: real files, present
 * before first paint, and replaced per-scenario the moment the owner sets a
 * `banner_url` in the content studio, which always wins.
 */

export type SceneMood = 'warm' | 'cool' | 'amber' | 'neon' | 'clinical';

export interface SceneLighting {
  /** Key light as an "r g b" triplet, ready for `rgb(var(--x) / a)`. */
  keyRgb: string;

  /** Shadow-side fill; keeps the frame from being one flat colour. */
  fillRgb: string;
  /** 0..1 — how strongly this light bleeds into glass surfaces. */
  warmth: number;
  mood: SceneMood;
  /** Arabic location label, e.g. "محطة القطار — برلين". */
  locationAr: string;
  /** Real scene artwork, when it exists. Absent = procedural lighting only. */
  artUrl?: string;
}

export interface SceneSource {
  id: string;
  category?: string | null;
  /** The scenario's own 16:9 artwork from the content editor, when it has one. */
  bannerUrl?: string | null;
}

const MOODS: Record<SceneMood, { keyRgb: string; fillRgb: string; warmth: number }> = {
  // Café, bakery, evening streets.
  warm: { keyRgb: '255 201 138', fillRgb: '198 92 46', warmth: 0.6 },
  // Stations, offices, winter daylight.
  cool: { keyRgb: '143 184 255', fillRgb: '58 84 140', warmth: 0.32 },
  // Flats, hallways, street lamps.
  amber: { keyRgb: '255 158 74', fillRgb: '150 60 20', warmth: 0.52 },
  // Night transport, signage, late shifts.
  neon: { keyRgb: '111 240 208', fillRgb: '124 92 240', warmth: 0.4 },
  // Practices, offices, waiting rooms.
  clinical: { keyRgb: '206 226 245', fillRgb: '120 150 190', warmth: 0.24 },
};

/** Category keyword → mood. First match wins, so order matters. */
const CATEGORY_MOODS: Array<{ keywords: string[]; mood: SceneMood }> = [
  { keywords: ['health', 'doctor', 'arzt'], mood: 'clinical' },
  { keywords: ['travel', 'transport', 'bahnhof', 'station'], mood: 'neon' },
  { keywords: ['housing', 'apartment', 'wohnung', 'home'], mood: 'amber' },
  { keywords: ['work', 'career', 'job', 'office', 'interview'], mood: 'cool' },
  { keywords: ['official', 'document', 'behoerde', 'authority'], mood: 'clinical' },
  { keywords: ['food', 'cafe', 'daily', 'shop', 'bakery'], mood: 'warm' },
];

/** Known locations get a real label; unknown content falls back to its category. */
const LOCATIONS: Record<string, { mood: SceneMood; locationAr: string }> = {
  // The story opening. It deliberately has no entry in `SCENARIO_ART` below, so
  // it borrows the category photograph instead of adding another remote image to
  // the cold-start path; only its light and its label are its own.
  airport_arrival: { mood: 'cool', locationAr: 'مطار برلين — قاعة القدوم' },
  cafe_order: { mood: 'warm', locationAr: 'مقهى في برلين — العصر' },
  bakery_shopping: { mood: 'warm', locationAr: 'مخبز في الحيّ — صباحاً' },
  doctor_visit: { mood: 'clinical', locationAr: 'عيادة طبيب عام — غرفة الانتظار' },
  apartment_viewing: { mood: 'amber', locationAr: 'شقة فارغة — معاينة' },
  job_interview: { mood: 'cool', locationAr: 'مكتب شركة — مقابلة عمل' },
  train_station: { mood: 'neon', locationAr: 'محطة القطار — رصيف مزدحم' },
};

/**
 * Local scene art, keyed by scenario id (`public/scenes/<id>.jpg`, 640×360).
 *
 * Owner-supplied `banner_url` still wins over these; this map is the offline
 * fallback that costs nothing on the network and ships in the service-worker
 * precache.
 */
const SCENARIO_ART: Record<string, string> = {
  cafe_order: '/scenes/cafe_order.jpg',
  bakery_shopping: '/scenes/bakery_shopping.jpg',
  doctor_visit: '/scenes/doctor_visit.jpg',
  apartment_viewing: '/scenes/apartment_viewing.jpg',
  job_interview: '/scenes/job_interview.jpg',
  train_station: '/scenes/train_station.jpg',
};

/** The same images, by category, for scenarios with no entry of their own. */
const CATEGORY_ART: Record<string, string> = {
  travel: '/scenes/travel.jpg',
  housing: '/scenes/housing.jpg',
  work: '/scenes/work.jpg',
  career: '/scenes/work.jpg',
  official: '/scenes/official.jpg',
  health: '/scenes/health.jpg',
  food: '/scenes/food.jpg',
  daily_life: '/scenes/daily_life.jpg',
};

const CATEGORY_LABELS_AR: Record<string, string> = {
  daily_life: 'الحياة اليومية',
  health: 'عند الطبيب',
  housing: 'السكن',
  career: 'العمل',
  work: 'العمل',
  travel: 'المواصلات',
  official: 'الجهات الرسمية',
  food: 'الطعام والمقهى',
};

function moodFor(source: SceneSource | undefined): SceneMood {
  if (!source) return 'warm';
  const known = LOCATIONS[source.id];
  if (known) return known.mood;
  const category = String(source.category || '').toLowerCase();
  const match = CATEGORY_MOODS.find((entry) => entry.keywords.some((keyword) => category.includes(keyword)));
  return match ? match.mood : 'warm';
}

/**
 * The lighting for one scenario. Always returns a usable scene: a mission with
 * unknown content still gets honest light and a category-level location label.
 */
export function sceneFor(source: SceneSource | undefined | null): SceneLighting {
  const mood = moodFor(source || undefined);
  const lighting = MOODS[mood];
  const known = source ? LOCATIONS[source.id] : undefined;
  const category = String(source?.category || '').toLowerCase();
  const categoryLabel =
    Object.entries(CATEGORY_LABELS_AR).find(([key]) => category.includes(key))?.[1] || 'في ألمانيا';

  const categoryArt = Object.entries(CATEGORY_ART).find(([key]) => category.includes(key))?.[1];

  return {
    ...lighting,
    mood,
    locationAr: known?.locationAr || categoryLabel,
    // Owner-supplied artwork wins over every placeholder, and an empty string is
    // treated as "no artwork" rather than as a source the browser will fail on.
    artUrl:
      (source?.bannerUrl && String(source.bannerUrl).trim()) ||
      (source ? SCENARIO_ART[source.id] : undefined) ||
      categoryArt,
  };
}

/** The scene's `background-image` layer stack — procedural light, no stock art. */
export function sceneBackdropLayers(scene: SceneLighting, artUrl?: string): { image: string; } {
  const layers = [
    // Key light pool, off-centre so the frame reads as a photographed space.
    `radial-gradient(120% 80% at 78% 8%, rgb(${scene.keyRgb} / 0.42) 0%, rgb(${scene.keyRgb} / 0) 58%)`,
    // Fill light from the opposite side.
    `radial-gradient(90% 70% at 12% 92%, rgb(${scene.fillRgb} / 0.38) 0%, rgb(${scene.fillRgb} / 0) 62%)`,
    // Floor bounce keeps the bottom of the frame from going pure black.
    `radial-gradient(140% 50% at 50% 118%, rgb(${scene.keyRgb} / 0.22) 0%, rgb(${scene.keyRgb} / 0) 70%)`,
  ];
  if (artUrl) {
    // The artwork sits above the light pools so the painting keeps its own
    // lighting, exactly as the art direction requires.
    layers.unshift(`url('${artUrl}')`);
  }
  return { image: layers.join(', ') };
}
