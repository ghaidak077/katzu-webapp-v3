import React from 'react';
import { cn } from '@/lib/cn';
import { sceneBackdropLayers, type SceneLighting } from '@/lib/design/scenes';

/**
 * A scenario's 16:9 banner — its thumbnail everywhere the scenario is listed.
 *
 * WHY ONE COMPONENT
 * The scenario thumbnail appeared in three different shapes on three screens (a
 * plain text card on the trail, a 210px scene on the mission card, no artwork at
 * all on the scenario's own screen). A learner learning "which situation is this?"
 * from German text is doing work the app should do for them, and it meant the same
 * scenario looked like a different product on each screen.
 *
 * HOW A BANNER IS CHOSEN, IN ORDER
 *  1. `scenarios.banner_url` — the column the content editor writes, so the owner
 *     can give a scenario real artwork from the admin panel with no deploy. This is
 *     the one that matters; everything below is a floor, not a design.
 *  2. The built-in per-scenario / per-category placeholder in `scenes.ts`.
 *  3. The scenario's own procedural lighting, with an honest label saying the
 *     artwork is still to come. Never a broken image, never a grey box.
 *
 * The image is a real `<img>` rather than a CSS background so the browser can do
 * what it is good at: `loading="lazy"` and `decoding="async"` mean a trail of
 * eight scenarios fetches what is on screen, not what might be.
 */

export interface ScenarioBannerProps {
  scene: SceneLighting;
  /** Describes the scene for a screen reader; empty for purely decorative use. */
  alt?: string;
  /** `eager` for the one banner above the fold, `lazy` for a list. */
  loading?: 'lazy' | 'eager';
  /** Slow parallax drift. Deprecated in V19 (motion removed); accepted for API compat. */
  drift?: boolean;
  className?: string;
  /** Overlay content, laid out inside the banner (labels, badges, Katzu). */
  children?: React.ReactNode;
}

export const ScenarioBanner: React.FC<ScenarioBannerProps> = ({
  scene,
  alt = '',
  loading = 'lazy',
  drift: _drift = false,
  className,
  children,
}) => {
  const layers = sceneBackdropLayers(scene).image;

  return (
    <div
      // A hook for measurement, not for styling: the banner is decorative art
      // (`alt=""`), so no accessibility role exposes it and a layout test needs
      // something to hold on to.
      data-testid="scenario-banner"
      className={cn('relative isolate aspect-[16/9] w-full overflow-hidden bg-black', className)}
      style={{ '--kz-scene-rgb': scene.keyRgb, '--kz-scene-warmth': String(scene.warmth) } as React.CSSProperties}
    >
      {/* Procedural light first: it is what the artwork, when there is any, sits on. */}
      <div aria-hidden className="absolute inset-0" style={{ backgroundImage: layers }} />

      {scene.artUrl ? (
        <img
          src={scene.artUrl}
          alt={alt}
          loading={loading}
          decoding="async"
          // V19: the 26s drift loop is gone. Phase 0 measured it as the one
          // infinite animation on the busiest screen (Journey Home runs it on a
          // full-width img — a continuous compositor job that carries no
          // information). The image keeps its static 105% scale for the
          // soft-edge look the drift was buying.
          className="absolute inset-0 h-full w-full scale-105 object-cover"
        />
      ) : (
        /* No artwork for this scenario yet.
           This used to print a sentence telling the learner the picture "will be
           added here" — a placeholder note addressed to the developer, shown to
           the one person who cannot act on it, in the place where a learner's
           first impression of the situation is being formed. The scene lighting
           below is a real, deliberate design rather than a stand-in, so a
           scenario without artwork now simply looks like a lit scene, and says
           nothing about what it is missing. */
        <div className="absolute inset-0" aria-hidden />
      )}

      {/* Film grain: keeps a large dark gradient from banding on an AMOLED panel. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.6'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Readability wash: Arabic text at the bottom stays legible over any photo,
          and the top of the frame keeps the subject the photographer chose. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgb(0 0 0 / 0.22) 0%, rgb(0 0 0 / 0) 38%, rgb(0 0 0 / 0.55) 100%)',
        }}
      />

      {children && <div className="relative z-10 h-full">{children}</div>}
    </div>
  );
};

export default ScenarioBanner;
