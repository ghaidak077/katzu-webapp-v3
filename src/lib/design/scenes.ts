/**
 * Cinematic scene lighting, derived from content — not hardcoded per screen.
 *
 * Every mission happens somewhere in Germany, and that somewhere has its own
 * light: a station at night is amber and sodium-yellow, a doctor's office is a
 * cold fluorescent blue, a café is warm gold. The UI glass adapts to that light
 * (`--kz-scene-rgb`), which is what stops the mission card from looking identical
 * over a warm scene and a cool one.
 *
 * Artwork: the placeholder photographs below are **temporary**. The repo ships
 * Katzu's sticker poses but no commissioned location art, and a procedural
 * gradient cannot carry a scene on its own, so each scenario borrows a real
 * Unsplash photograph (verified to resolve, loaded with `fit=crop` and covered by
 * the readability wash so Arabic text stays legible). A licensed-stock or
 * commissioned-art pass is still an open item — see
 * `KATZU_V2_IMPLEMENTATION_LOG.md` §8. `artUrl` remains the seam a real scene
 * painting drops into, and nothing here pretends the lighting is a photograph.
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
  cafe_order: { mood: 'warm', locationAr: 'مقهى في برلين — العصر' },
  bakery_shopping: { mood: 'warm', locationAr: 'مخبز في الحيّ — صباحاً' },
  doctor_visit: { mood: 'clinical', locationAr: 'عيادة طبيب عام — غرفة الانتظار' },
  apartment_viewing: { mood: 'amber', locationAr: 'شقة فارغة — معاينة' },
  job_interview: { mood: 'cool', locationAr: 'مكتب شركة — مقابلة عمل' },
  train_station: { mood: 'neon', locationAr: 'محطة القطار — رصيف مزدحم' },
};

/**
 * Temporary scene photography, keyed by scenario id.
 *
 * Every URL was checked to resolve (`images.unsplash.com/photo-…` → 200) before
 * being added: a broken backdrop is worse than an honest gradient. The
 * scenario → photograph *mapping* has not been eyeballed against the content, so
 * it is a placeholder in the strongest sense.
 */
const SCENARIO_ART: Record<string, string> = {
  cafe_order: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=70',
  bakery_shopping: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=70',
  doctor_visit: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=70',
  apartment_viewing: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=70',
  job_interview: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=70',
  train_station: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=1200&q=70',
};

/** The same photographs, by category, for scenarios with no entry of their own. */
const CATEGORY_ART: Record<string, string> = {
  travel: 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=1200&q=70',
  housing: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=70',
  work: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=70',
  career: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=70',
  official: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=70',
  health: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=70',
  food: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=70',
  daily_life: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1200&q=70',
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
    artUrl: (source ? SCENARIO_ART[source.id] : undefined) || categoryArt,
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
