import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/components/ui/Button';
import { useReducedMotion } from '@/components/glass/GlassSurface';
import { VOICE_ACTIVITY_THRESHOLD, type MicSample } from '@/lib/audio/useMicLevel';
import { VoicePoweredOrb } from '@/components/effects/VoicePoweredOrb';

/**
 * The Katzu orb.
 *
 * One continuous object across every interaction state — idle, listening,
 * transcribing, evaluating, replying, error, offline, quota — never five
 * different icons. It is an iridescent liquid-metal sphere: a near-black body
 * with drifting internal blobs, two thin rotating rings, a rim light that runs
 * lavender to white, and a soft specular highlight.
 *
 * TWO BODIES, ONE CONTROL
 * The sphere itself is `VoicePoweredOrb` (WebGL/GLSL) — a real liquid-metal body
 * whose shape follows the learner's voice through uniforms. The 2D canvas below is
 * kept as the fallback body: with no WebGL (an old engine, a blocked context, a
 * driver that rejects the shader) the orb still exists and still reacts, rather
 * than leaving the conversation with a hole where its microphone control was. The
 * fallback is not a downgrade path a learner can be told about — it is the same
 * object drawn with what the engine has.
 *
 * AUDIO REACTIVITY (the honest version)
 * When a microphone stream is live, every frame reads real amplitude and real
 * frequency bands from the analyser (`readLevel`), and the sphere's deformation,
 * radius and ripple emission follow that data. `readLevel` is handed to the WebGL
 * body as a reader, not as props, so the live orb costs zero React renders a
 * second. During `replying` there is no amplitude to read: the Web Speech API
 * exposes none, so the motion there is synced to the utterance lifecycle and is
 * documented as such — it does not pretend to be Katzu's voice waveform.
 *
 * The canvas is aria-hidden; the button around it carries the accessible name
 * and the live state, so a screen reader hears "يستمع" rather than "canvas".
 */

export type OrbState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'evaluating'
  | 'replying'
  | 'error'
  | 'offline'
  | 'quota';

export interface KatzuOrbProps {
  state: OrbState;
  /** Real microphone samples. Absent when there is no stream (typed/offline). */
  readLevel?: () => MicSample;
  /** Magenta is allowed only when a reply carries something meaningful. */
  tone?: 'lavender' | 'earned';
  size?: number;
  onPress?: () => void;
  disabled?: boolean;
  /** Arabic accessible name for the control, e.g. "ابدأ التحدث". */
  labelAr: string;
  className?: string;
}

interface Orbit {
  /** Released at peak amplitude; grows and fades while listening. */
  radius: number;
  alpha: number;
}

const LAVENDER = [180, 160, 255] as const;
const MAGENTA = [255, 111, 216] as const;
const SILVER = [228, 226, 245] as const;
const MUTED = [148, 148, 166] as const;

function rgba(color: readonly [number, number, number], alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

/** Per-state motion recipe: how alive the orb is, and how it is lit. */
function recipe(state: OrbState, reduced: boolean) {
  switch (state) {
    case 'listening':
      return { motion: reduced ? 0.16 : 0.3, speed: 1.0, alpha: 1, tint: LAVENDER, ripple: true, bars: false };
    case 'transcribing':
      return { motion: reduced ? 0.12 : 0.34, speed: 1.9, alpha: 0.96, tint: LAVENDER, ripple: false, bars: false };
    case 'evaluating':
      return { motion: reduced ? 0.1 : 0.16, speed: 0.32, alpha: 0.9, tint: LAVENDER, ripple: false, bars: false };
    case 'replying':
      return { motion: reduced ? 0.14 : 0.26, speed: 1.1, alpha: 0.98, tint: LAVENDER, ripple: false, bars: true };
    case 'error':
      // Calm and desaturated: no red flash, no punishment.
      return { motion: reduced ? 0.05 : 0.09, speed: 0.22, alpha: 0.6, tint: MUTED, ripple: false, bars: false };
    case 'offline':
      return { motion: reduced ? 0.04 : 0.08, speed: 0.18, alpha: 0.52, tint: MUTED, ripple: false, bars: false };
    case 'quota':
      return { motion: reduced ? 0.06 : 0.12, speed: 0.3, alpha: 0.66, tint: MUTED, ripple: false, bars: false };
    default:
      return { motion: reduced ? 0.08 : 0.14, speed: 0.45, alpha: 0.8, tint: LAVENDER, ripple: false, bars: false };
  }
}

export const KatzuOrb: React.FC<KatzuOrbProps> = ({
  state,
  readLevel,
  tone = 'lavender',
  size = 118,
  onPress,
  disabled = false,
  labelAr,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ripplesRef = useRef<Orbit[]>([]);
  const voiceActiveRef = useRef(false);
  const reduceMotion = useReducedMotion();

  /**
   * Which body is drawing.
   *
   * Starts on WebGL and is downgraded once, by the WebGL body itself, if it cannot
   * run. One live context exists at a time: the 2D loop below does not even start
   * while the GL body is drawing, so the fallback costs nothing when it is unused.
   */
  const [useWebGL, setUseWebGL] = useState(true);

  // The frame loop reads props through refs: re-rendering React on every state
  // change must never restart the animation or reset the liquid.
  const stateRef = useRef(state);
  const toneRef = useRef(tone);
  const levelRef = useRef(readLevel);
  const reducedRef = useRef(reduceMotion);
  stateRef.current = state;
  toneRef.current = tone;
  levelRef.current = readLevel;
  reducedRef.current = reduceMotion;

  const drawFrame = useCallback((time: number) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const cssSize = canvas.clientWidth || size;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const pixelSize = Math.round(cssSize * dpr);
    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
    }

    const currentState = stateRef.current;
    const currentTone = toneRef.current;
    const reduced = reducedRef.current;
    const level = levelRef.current?.() ?? { amplitude: 0, bands: [0, 0, 0, 0] as MicSample['bands'], active: false };
    const config = recipe(currentState, reduced);

    // Reduced motion keeps the amplitude feedback (it is information) but drops
    // the continuous drift: the orb breathes with the voice, it does not swirl.
    const t = reduced ? 0 : time / 1000;
    const amplitude = level.active ? level.amplitude : 0;
    const motionAmp = config.motion + amplitude * 1.15;

    const center = pixelSize / 2;
    const radius = pixelSize * 0.33;
    const accent = currentTone === 'earned' && stateRef.current !== 'error' ? MAGENTA : config.tint;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixelSize, pixelSize);

    // 1. Outer glow — the only place the orb touches the space around it.
    const glowRadius = radius * (1.32 + amplitude * 0.26 + (stateRef.current === 'listening' ? 0.08 : 0));
    const glow = context.createRadialGradient(center, center, radius * 0.7, center, center, glowRadius);
    glow.addColorStop(0, rgba(accent, 0.24 * config.alpha + amplitude * 0.12));
    glow.addColorStop(1, rgba(accent, 0));
    context.fillStyle = glow;
    context.fillRect(0, 0, pixelSize, pixelSize);

    // Ripples, released when the learner's voice crosses the activity threshold.
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const ripple of ripplesRef.current) {
      context.beginPath();
      context.arc(center, center, ripple.radius, 0, Math.PI * 2);
      context.strokeStyle = rgba(config.tint, ripple.alpha * 0.5);
      context.lineWidth = 1.2 * dpr;
      context.stroke();
    }
    context.restore();

    // 2. The sphere body.
    context.save();
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.clip();

    context.fillStyle = 'rgba(5, 5, 8, 1)';
    context.fillRect(0, 0, pixelSize, pixelSize);

    context.globalCompositeOperation = 'lighter';
    const blobCount = 5;
    for (let index = 0; index < blobCount; index += 1) {
      const bandInfluence = level.active ? level.bands[index % 4] : 0;
      const phase = index * 1.7 + t * config.speed * (0.8 + index * 0.13);
      const orbit = radius * (0.34 + 0.16 * (index % 3)) * motionAmp;
      const x = center + Math.cos(phase) * orbit;
      const y = center + Math.sin(phase * 1.13 + index) * orbit;
      const blobRadius = radius * (0.42 + 0.16 * index * 0.2) * (0.85 + motionAmp * 0.5 + bandInfluence * 0.6);
      const blob = context.createRadialGradient(x, y, 0, x, y, Math.max(1, blobRadius));
      const blobTint =
        index % 3 === 0 ? SILVER : index % 3 === 1 ? accent : config.tint;
      blob.addColorStop(0, rgba(blobTint, 0.5 * config.alpha));
      blob.addColorStop(0.55, rgba(blobTint, 0.16 * config.alpha));
      blob.addColorStop(1, rgba(blobTint, 0));
      context.fillStyle = blob;
      context.beginPath();
      context.arc(x, y, Math.max(1, blobRadius), 0, Math.PI * 2);
      context.fill();
    }

    // Internal depth: keeps the metal from looking like a flat glow.
    const core = context.createRadialGradient(
      center - radius * 0.3,
      center - radius * 0.35,
      radius * 0.05,
      center,
      center,
      radius * 1.05,
    );
    core.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    core.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
    core.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = core;
    context.fillRect(0, 0, pixelSize, pixelSize);

    // Reply bars: lifecycle-synced, not amplitude-reactive (the TTS API exposes none).
    if (config.bars) {
      const barCount = 7;
      context.globalCompositeOperation = 'lighter';
      for (let index = 0; index < barCount; index += 1) {
        const position = (index - (barCount - 1) / 2) * (radius * 0.19);
        const height =
          radius *
          0.18 *
          (0.5 + 0.5 * Math.abs(Math.sin(t * 6 + index * 1.1))) *
          (1 - Math.abs(position) / (radius * 1.1));
        // `roundRect` is absent on older Safari; a throw inside the frame loop
        // would end the animation for good, so fall back to a plain bar.
        context.beginPath();
        if (typeof context.roundRect === 'function') {
          context.roundRect(center + position - dpr, center - height / 2, 2 * dpr, Math.max(2, height), dpr);
        } else {
          context.rect(center + position - dpr, center - height / 2, 2 * dpr, Math.max(2, height));
        }
        context.fillStyle = rgba(SILVER, 0.4);
        context.fill();
      }
      context.globalCompositeOperation = 'source-over';
    }
    context.restore();

    // 3. Rings — two thin rotating arcs, the "instrument" around the metal.
    const ringRotation = t * config.speed * 0.6;
    [
      { radius: radius * 1.09, alpha: 0.26, span: Math.PI * 1.35, offset: 0 },
      { radius: radius * 1.19, alpha: 0.14, span: Math.PI * 0.7, offset: Math.PI },
    ].forEach((ring) => {
      context.beginPath();
      context.arc(center, center, ring.radius, ringRotation + ring.offset, ringRotation + ring.offset + ring.span);
      context.strokeStyle = rgba(config.tint, ring.alpha * config.alpha);
      context.lineWidth = 1.1 * dpr;
      context.stroke();
    });

    // 4. Rim light: lavender at the top-left, white at the bottom-right.
    const rim = context.createLinearGradient(center - radius, center - radius, center + radius, center + radius);
    rim.addColorStop(0, rgba(config.tint, 0.5 * config.alpha));
    rim.addColorStop(0.5, rgba(SILVER, 0.18 * config.alpha));
    rim.addColorStop(1, rgba(accent, 0.42 * config.alpha));
    context.beginPath();
    context.arc(center, center, radius - dpr * 0.5, 0, Math.PI * 2);
    context.strokeStyle = rim;
    context.lineWidth = 1.4 * dpr;
    context.stroke();

    // 5. Specular highlight, offset up-left like a real light source.
    const specular = context.createRadialGradient(
      center - radius * 0.36,
      center - radius * 0.42,
      0,
      center - radius * 0.36,
      center - radius * 0.42,
      radius * 0.5,
    );
    specular.addColorStop(0, `rgba(255, 255, 255, ${0.3 * config.alpha})`);
    specular.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = specular;
    context.fillRect(0, 0, pixelSize, pixelSize);
  }, [size]);

  useEffect(() => {
    // The GL body owns the sphere while it is drawing; running this loop as well
    // would mean two renderers racing for the same pixels.
    if (useWebGL) return;

    let frame = 0;
    let lastRippleAt = 0;
    let disposed = false;

    const loop = (time: number) => {
      if (disposed) return;
      const level = levelRef.current?.();
      const currentState = stateRef.current;

      // Voice-activity ripples: emitted on the rising edge, throttled so a long
      // sentence does not turn into a strobe.
      if (currentState === 'listening' && level?.active) {
        const isVoice = level.amplitude > VOICE_ACTIVITY_THRESHOLD;
        if (isVoice && !voiceActiveRef.current && time - lastRippleAt > 260) {
          lastRippleAt = time;
          const canvas = canvasRef.current;
          const radius = canvas ? (canvas.clientWidth || size) * 0.33 : 39;
          ripplesRef.current.push({ radius, alpha: 0.55 });
        }
        voiceActiveRef.current = isVoice;
      } else {
        voiceActiveRef.current = false;
      }

      ripplesRef.current = ripplesRef.current.filter((ripple) => {
        ripple.radius += 1.9;
        ripple.alpha *= 0.955;
        return ripple.alpha > 0.03;
      });
      if (ripplesRef.current.length > 6) ripplesRef.current.splice(0, ripplesRef.current.length - 6);

      drawFrame(time);
      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      ripplesRef.current = [];
    };
  }, [drawFrame, size, useWebGL]);

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={labelAr}
      className={cn(
        // V20: no active:scale — the orb's press feedback is its own light (the
        // WebGL body and the press ring), which is meaning-bearing; a transform
        // squish on top is decoration the low tier pays for.
        'relative flex items-center justify-center rounded-full disabled:opacity-60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kz-lavender/60',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {useWebGL ? (
        <VoicePoweredOrb
          state={state}
          amplitude={0}
          bands={[0, 0, 0, 0]}
          readLevel={readLevel}
          tone={tone}
          // Reduced motion keeps the voice response (it is information) and drops
          // the drift — the same rule the 2D body applies.
          motionScale={reduceMotion ? 0.18 : 1}
          size={size}
          onFailure={() => setUseWebGL(false)}
        />
      ) : (
        <canvas ref={canvasRef} aria-hidden className="h-full w-full" style={{ width: size, height: size }} />
      )}
    </button>
  );
};

export default KatzuOrb;
