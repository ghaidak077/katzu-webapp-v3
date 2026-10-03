import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/components/glass/GlassSurface';
import { attachPulse, buildBeamCss, buildPulseConfig, type BeamPalette } from './borderBeamCss';

/**
 * The living edge, in two roles.
 *
 *   ambient  → the outward breathe on a glass card at rest: the mission card, an
 *              earned capability. This is the layer that makes a still screen feel
 *              inhabited rather than painted.
 *   active   → the travelling comet on a control that is engaged: the active tab,
 *              a control under the finger.
 *
 * It replaces the previous CSS-only neon edge, which was a static custom-property
 * glow. Two colours, never three: lavender is the ordinary accent and magenta is
 * earned — and `palette="earned"` is the only way to ask for magenta, so a screen
 * cannot quietly use it for decoration.
 *
 * Cost control, because a glowing border is not worth a janky conversation:
 *  - one shared 30 fps driver for every beam in the app, stopped when none is mounted;
 *  - nothing is animated off-screen (`data-paused` under IntersectionObserver);
 *  - reduced motion slows the loop rather than freezing the surface.
 */
export interface BorderBeamProps {
  children?: React.ReactNode;
  /** `ambient` for surfaces at rest, `active` for engaged controls. */
  role?: 'ambient' | 'active';
  /** Magenta is earned-only. `lavender` is everything else. */
  palette?: BeamPalette;
  /** Turn the beam off without unmounting the surface it decorates. */
  enabled?: boolean;
  /** Seconds per cycle. Ambient is slower, active is a touch quicker. */
  duration?: number;
  /** Corner radius. Omit to inherit the child's own radius. */
  borderRadius?: number;
  /** Beam thickness in px for the active role. */
  beamWidth?: number;
  /** 0..1 overall opacity knob, for surfaces that should whisper. */
  strength?: number;
  /** Identity for `GlassEffectContainer`, which morphs its shared shape onto it. */
  glassKey?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const BorderBeam: React.FC<BorderBeamProps> = ({
  children,
  role = 'ambient',
  palette = 'lavender',
  enabled = true,
  duration,
  borderRadius,
  beamWidth = 1,
  strength = 1,
  glassKey,
  className,
  style,
}) => {
  const rawId = useId();
  const id = rawId.replace(/[:«»]/g, '');
  const reduceMotion = useReducedMotion();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [autoRadius, setAutoRadius] = useState<number | null>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [mounted, setMounted] = useState(false);

  const variant = role === 'active' ? 'line' : 'pulse-outside';
  const cycle = duration ?? (role === 'active' ? 3.1 : 2.3);
  const radius = borderRadius ?? autoRadius ?? 24;

  // Fade the beam in on the frame after mount so the first paint is the surface,
  // not an animated edge arriving out of nowhere.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Inherit the radius the child actually has, rather than guessing a token: a
  // squircle card and a pill button differ, and a mismatched beam is a visible seam.
  useLayoutEffect(() => {
    if (borderRadius != null) return;
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const child = host.firstElementChild;
      if (!child) return;
      const parsed = parseFloat(getComputedStyle(child).borderTopLeftRadius);
      if (Number.isFinite(parsed) && parsed > 0) setAutoRadius(parsed);
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(host, { childList: true, subtree: false });
    return () => observer.disconnect();
  }, [borderRadius, children]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setOnScreen(entry.isIntersecting);
      },
      { rootMargin: '256px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const css = useMemo(
    () =>
      buildBeamCss({
        id,
        variant,
        palette,
        borderRadius: radius,
        borderWidth: beamWidth,
        duration: cycle,
        strength,
      }),
    [id, variant, palette, radius, beamWidth, cycle, strength],
  );

  const animating = enabled && mounted && onScreen;

  // The ambient role is the one driven by the JS oscillator; the active role is
  // pure CSS keyframes, so it costs nothing on the main thread.
  useEffect(() => {
    if (variant !== 'pulse-outside' || !animating) return;
    const host = hostRef.current;
    if (!host) return;
    return attachPulse(host, buildPulseConfig(cycle, id, reduceMotion));
  }, [variant, animating, cycle, id, reduceMotion]);

  return (
    <>
      <style>{css}</style>
      <div
        ref={hostRef}
        data-rim={id}
        data-glass-key={glassKey}
        data-active={animating ? '' : undefined}
        data-paused={!onScreen ? '' : undefined}
        className={cn('relative', role === 'ambient' && 'isolate', className)}
        style={{ ...style, '--rim-strength': strength } as React.CSSProperties}
      >
        {children}
        <div data-rim-glow className="pointer-events-none" />
      </div>
    </>
  );
};

export default BorderBeam;
