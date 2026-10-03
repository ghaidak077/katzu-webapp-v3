import React from 'react';
import { cn } from '@/lib/cn';
import { sceneBackdropLayers, type SceneLighting } from '@/lib/design/scenes';

export interface SceneBackdropProps extends React.HTMLAttributes<HTMLDivElement> {
  scene: SceneLighting;
  /** Overrides `scene.artUrl`; absent = the procedural lighting alone. */
  artUrl?: string;
  /** Slow parallax drift. Off for small fragments, on for full-screen scenes. */
  drift?: boolean;
  /** Dark readability wash over the art, so glass text stays legible. */
  readability?: boolean;
  children?: React.ReactNode;
}

/**
 * The cinematic location layer.
 *
 * It publishes the scene's light as CSS custom properties on itself, so every
 * glass surface inside it absorbs that light automatically — warm gold in a café,
 * cold blue in a practice. The artwork, when one exists, is never re-tinted; it
 * sits above the procedural light pools and keeps its own colours.
 *
 * The vignette and grain are what stop a flat gradient from reading as "scene":
 * they give the frame a focal point and a film texture.
 */
export const SceneBackdrop: React.FC<SceneBackdropProps> = ({
  scene,
  artUrl,
  drift: _drift = false,
  readability = true,
  className,
  style,
  children,
  ...props
}) => {
  // The scene's own placeholder artwork is used unless a screen overrides it, so
  // every surface that renders a scene gets its photograph without threading the
  // URL through each call site.
  const resolvedArt = artUrl ?? scene.artUrl;
  const layers = sceneBackdropLayers(scene, resolvedArt);

  return (
    <div
      className={cn('relative isolate overflow-hidden bg-black', className)}
      style={
        {
          '--kz-scene-rgb': scene.keyRgb,
          '--kz-scene-warmth': String(scene.warmth),
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      <div
        aria-hidden
        // V19: no drift loop. Same measured reason as the banner: a 26s infinite
        // transform on a full-screen layer is continuous compositing work that
        // carries no information.
        className="absolute inset-0"
        style={{
          backgroundImage: layers.image,
          backgroundSize: resolvedArt ? 'cover, auto, auto, auto' : 'auto',
          backgroundPosition: resolvedArt ? 'center, auto, auto, auto' : 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* Film grain: keeps large dark gradients from banding on AMOLED panels. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.14] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.6'/%3E%3C/svg%3E\")",
        }}
      />
      {readability && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            // Two-directional wash: readable text at the bottom, art preserved at
            // the top where the scene's subject usually lives.
            backgroundImage:
              'linear-gradient(180deg, rgb(0 0 0 / 0.28) 0%, rgb(0 0 0 / 0.05) 34%, rgb(0 0 0 / 0.62) 78%, rgb(0 0 0 / 0.88) 100%)',
          }}
        />
      )}
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
};
