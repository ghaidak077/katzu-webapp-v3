import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/components/ui/Button';
import { useReducedMotion } from './GlassSurface';

/**
 * Liquid Glass, as behaviour rather than as a look.
 *
 * Ported from what Apple's `GlassEffectContainer` / `glassEffectID` actually *do*,
 * into one reusable primitive and one hook — not per-screen effects:
 *
 *  - **Container blending.** Two glass surfaces sitting close together should read
 *    as one material, not two. The container measures its children and bridges the
 *    gaps between them with a shared blurred layer whose strength rises as they get
 *    closer (`spacing` is the distance at which blending begins). One backdrop is
 *    shared by the whole group, which is also cheaper than each surface compositing
 *    its own.
 *  - **Morphing identity.** When the active child changes, the shared shape travels
 *    to its new home instead of a hard cut: the previous rectangle is captured and
 *    the new one is reached through a FLIP animation. Apple gets this from
 *    `glassEffectID` + `matchedGeometry`; here it is the Web Animations API, which
 *    runs it off the main thread.
 *  - **Interactive touch.** `useGlassInteractive` gives any glass control the live
 *    highlight that standard glass buttons have: press position and intensity are
 *    published as custom properties while the finger is down.
 *
 * Keyboard users are not left out and reduced motion is honoured: the morph becomes
 * a jump, and the press highlight is driven by `:focus-visible` as well as pointer.
 */

export interface GlassEffectContainerProps {
  children: React.ReactNode;
  /** Distance (px) at which two surfaces start to merge. */
  spacing?: number;
  /** `data-glass-key` of the child the shared shape should sit on. */
  activeKey?: string | null;
  className?: string;
}

interface Box {
  key: string | null;
  left: number;
  top: number;
  width: number;
  height: number;
}

const MORPH_MS = 320;

function measureChildren(container: HTMLElement): Box[] {
  const parent = container.getBoundingClientRect();
  return Array.from(container.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && !child.hasAttribute('data-glass-ignore'))
    .map((child) => {
      const rect = child.getBoundingClientRect();
      return {
        key: child.getAttribute('data-glass-key'),
        left: rect.left - parent.left,
        top: rect.top - parent.top,
        width: rect.width,
        height: rect.height,
      };
    });
}

export const GlassEffectContainer: React.FC<GlassEffectContainerProps> = ({
  children,
  spacing = 16,
  activeKey = null,
  className,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const previousPillRef = useRef<Box | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const reduceMotion = useReducedMotion();

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const next = measureChildren(host);
    // Only re-render when something moved; a ResizeObserver fires on scroll-sized
    // changes too, and the blend layers are depth-free children of this component.
    setBoxes((current) =>
      current.length === next.length &&
      current.every((box, index) =>
        box.key === next[index].key &&
        Math.abs(box.left - next[index].left) < 0.5 &&
        Math.abs(box.top - next[index].top) < 0.5 &&
        Math.abs(box.width - next[index].width) < 0.5 &&
        Math.abs(box.height - next[index].height) < 0.5,
      )
        ? current
        : next,
    );
  }, []);

  useLayoutEffect(() => {
    measure();
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    Array.from(host.children).forEach((child) => {
      if (!child.hasAttribute('data-glass-ignore')) observer.observe(child);
    });
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, children]);

  const activeIndex = activeKey == null ? -1 : boxes.findIndex((box) => box.key === activeKey);
  const activeBox = activeIndex >= 0 ? boxes[activeIndex] : null;

  /** The shared shape travels rather than jumps — `matchedGeometry`, for the web. */
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const previous = previousPillRef.current;
    if (!pill || !activeBox) return;
    previousPillRef.current = activeBox;
    if (!previous || reduceMotion || typeof pill.animate !== 'function') return;
    const samePlace =
      Math.abs(previous.left - activeBox.left) < 1 && Math.abs(previous.width - activeBox.width) < 1;
    if (samePlace) return;
    pill.animate(
      [
        { transform: `translateX(${previous.left - activeBox.left}px)`, width: `${previous.width}px` },
        { transform: 'translateX(0)', width: `${activeBox.width}px` },
      ],
      { duration: MORPH_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }, [activeBox, reduceMotion]);

  /**
   * Bridge strengths.
   *
   * Each adjacent pair gets a strength that rises as the gap closes, and the shared
   * backdrop takes the strongest of them — so a group that is touching reads as one
   * surface, and a group that has spread out stops pretending to be.
   */
  const bridges = boxes.slice(0, -1).map((box, index) => {
    const next = boxes[index + 1];
    const gap = next.left - (box.left + box.width);
    const strength = Math.max(0, Math.min(1, 1 - gap / Math.max(1, spacing)));
    return { left: box.left + box.width - 4, top: Math.min(box.top, next.top), width: Math.max(0, gap + 8), height: Math.max(box.height, next.height), strength };
  });
  const blendStrength = bridges.reduce((max, bridge) => Math.max(max, bridge.strength), 0);
  const union = boxes.length
    ? {
        left: Math.min(...boxes.map((box) => box.left)) - spacing,
        right: Math.max(...boxes.map((box) => box.left + box.width)) + spacing,
        top: Math.min(...boxes.map((box) => box.top)) - spacing / 2,
        bottom: Math.max(...boxes.map((box) => box.top + box.height)) + spacing / 2,
      }
    : null;

  return (
    <div ref={hostRef} className={cn('relative', className)} data-glass-container>
      {union && blendStrength > 0.02 && (
        <div
          data-glass-ignore
          aria-hidden
          className="pointer-events-none absolute z-0 rounded-[999px]"
          style={{
            left: union.left,
            top: union.top,
            width: union.right - union.left,
            height: union.bottom - union.top,
            // One shared blurred backdrop behind the whole group: this is what makes
            // neighbouring surfaces read as a single piece of glass.
            backdropFilter: `blur(${(6 + blendStrength * 10).toFixed(1)}px)`,
            WebkitBackdropFilter: `blur(${(6 + blendStrength * 10).toFixed(1)}px)`,
            background: `rgb(255 255 255 / ${(0.015 + blendStrength * 0.03).toFixed(3)})`,
            opacity: 0.4 + blendStrength * 0.6,
            transition: 'opacity 220ms ease-out',
          }}
        />
      )}
      {bridges.map((bridge, index) =>
        bridge.strength > 0.02 && bridge.width > 0 ? (
          <div
            key={`bridge-${index}`}
            data-glass-ignore
            aria-hidden
            className="pointer-events-none absolute z-0"
            style={{
              left: bridge.left,
              top: bridge.top,
              width: bridge.width,
              height: bridge.height,
              background: `rgb(255 255 255 / ${(bridge.strength * 0.05).toFixed(3)})`,
              filter: 'blur(6px)',
              opacity: bridge.strength,
            }}
          />
        ) : null,
      )}
      {activeBox && (
        <div
          ref={pillRef}
          data-glass-ignore
          aria-hidden
          className="pointer-events-none absolute z-0 rounded-[18px]"
          style={{
            left: activeBox.left,
            top: activeBox.top,
            width: activeBox.width,
            height: activeBox.height,
            background: 'rgb(180 160 255 / 0.1)',
            boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.06)',
          }}
        />
      )}
      {children}
    </div>
  );
};

/**
 * `.interactive()` for the web: a live highlight under the finger.
 *
 * The position is written to `--kz-press-x/y` and the state to `data-pressed`, so
 * the surface CSS decides how it lights up — the hook only reports where the
 * learner is touching. Attach it to any glass control.
 */
export interface GlassInteractive<T extends HTMLElement> {
  ref: React.RefObject<T>;
  pressed: boolean;
  onPointerDown: React.PointerEventHandler<T>;
  onPointerMove: React.PointerEventHandler<T>;
  onPointerUp: React.PointerEventHandler<T>;
  onPointerCancel: React.PointerEventHandler<T>;
  onPointerLeave: React.PointerEventHandler<T>;
}

export function useGlassInteractive<T extends HTMLElement>(): GlassInteractive<T> {
  const ref = useRef<T>(null);
  const [pressed, setPressed] = useState(false);

  const publish = useCallback((event: React.PointerEvent<T>) => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    element.style.setProperty('--kz-press-x', `${x.toFixed(1)}%`);
    element.style.setProperty('--kz-press-y', `${y.toFixed(1)}%`);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.toggleAttribute('data-pressed', pressed);
  }, [pressed]);

  return {
    ref,
    pressed,
    onPointerDown: (event) => {
      publish(event);
      setPressed(true);
    },
    onPointerMove: (event) => {
      if (pressed) publish(event);
    },
    onPointerUp: () => setPressed(false),
    onPointerCancel: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
  };
}

export default GlassEffectContainer;
