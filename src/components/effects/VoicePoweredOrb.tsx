import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mesh, Program, Renderer, Triangle, Vec3 } from 'ogl';
import type { MicSample } from '@/lib/audio/useMicLevel';
// Type-only, so the KatzuOrb ↔ VoicePoweredOrb pair stays a runtime cycle-free
// one-way import: the orb body never reaches back into the screen component.
import type { OrbState } from '@/components/voice/KatzuOrb';

/**
 * The Katzu orb's WebGL body.
 *
 * A forked `VoicePoweredOrb`: the shader is unchanged in substance, the data
 * source is entirely different. This component **never touches the microphone** —
 * no `getUserMedia`, no `AudioContext`, no analyser. The app already owns one real
 * mic stream (`useMicLevel`) and one recognition pipeline (`useSpeechInput`); a
 * second stream here would mean a second permission prompt and two live audio
 * graphs for one conversation. Amplitude and band energy therefore arrive as
 * props, read from the same rAF loop that already feeds the 2D body.
 *
 * Everything that can fail is contained:
 *
 *  - init failure (no WebGL, a blocked context, a driver that rejects the shader)
 *    calls `onFailure` and renders nothing, so the caller keeps its 2D body.
 *  - a throw inside the frame body stops the loop and reports it, because a
 *    partially-updated WebGL frame must never freeze the orb forever.
 *  - a browser-forced context loss (a GPU reset, a driver crash, an evicted
 *    context) also calls `onFailure`, because a lost context accepts every call and
 *    draws nothing — no throw, so the loop would otherwise render into it forever.
 *  - unmount removes the canvas and frees the program and geometry, but does **not**
 *    force the context lost: that call was measured at 9,303 ms of synchronous
 *    main-thread work on a software rasteriser (48.6 s with the CPU contended), so
 *    the release that used to buy hygiene cost the learner a frozen screen on every
 *    exit from the conversation. The context goes with the canvas.
 *
 * Reduced motion keeps the amplitude response — it is information, not decoration —
 * and drops the drift and rotation. The same rule the 2D body documents, so the two
 * renderers cannot disagree about what "reduced" means.
 */

export interface VoicePoweredOrbProps {
  /** Live microphone samples; absent = the static `amplitude`/`bands` props. */
  readLevel?: () => MicSample;
  state: OrbState;
  /** Smoothed 0..1 amplitude from the app's own microphone stream. */
  amplitude: number;
  /** Four speech bands, low → high, each 0..1. */
  bands: [number, number, number, number];
  /**
   * The live sample reader, from `useMicLevel`.
   *
   * The props above describe the level; this supplies it every frame. Both exist
   * on purpose: a static caller (a storybook page, a test, an orb with no stream)
   * passes numbers, while the live conversation passes the reader so sixty frames
   * a second cost zero React renders. Reading through props alone would mean
   * re-rendering the whole conversation screen per audio frame.
  /** Magenta is allowed only when a reply carried something meaningful. */
  tone?: 'lavender' | 'earned';
  /** 1 = full motion, lower = calmer. Set by the reduced-motion rule. */
  motionScale?: number;
  size?: number;
  className?: string;
  /** Called when WebGL is unavailable or the loop throws. Never called twice. */
  onFailure: () => void;
}

/** Per-state motion, mirroring the 2D recipe so both renderers agree. */
function stateMotion(state: OrbState): { speed: number; spin: number; energy: number; saturation: number } {
  switch (state) {
    case 'listening':
      return { speed: 1, spin: 0.42, energy: 1, saturation: 1 };
    case 'transcribing':
      return { speed: 1.7, spin: 0.72, energy: 0.95, saturation: 1 };
    case 'evaluating':
      return { speed: 0.36, spin: 0.18, energy: 0.8, saturation: 0.95 };
    case 'replying':
      return { speed: 0.9, spin: 0.5, energy: 1, saturation: 1 };
    case 'error':
    case 'offline':
    case 'quota':
      // Calm and desaturated: no red flash, no punishment.
      return { speed: 0.22, spin: 0.1, energy: 0.55, saturation: 0.55 };
    default:
      return { speed: 0.5, spin: 0.26, energy: 0.85, saturation: 0.9 };
  }
}

/** Katzu's tokens, as GLSL wants them — linear-ish floats, not hex. */
const LAVENDER: [number, number, number] = [0.706, 0.627, 1.0];
const SILVER: [number, number, number] = [0.894, 0.886, 0.961];
const DEEP: [number, number, number] = [0.055, 0.043, 0.13];
const MAGENTA: [number, number, number] = [1.0, 0.435, 0.847];

const VERTEX_SHADER = `
  precision highp float;
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

/**
 * The liquid-metal sphere.
 *
 * `baseColor1..3` are uniforms here rather than the demo's hardcoded violet/cyan:
 * the palette is Katzu's (lavender key, silver specular, deep violet body, magenta
 * when something was earned), which is what removes the demo's rainbow entirely.
 * `uLow`/`uHigh` carry real speech-band energy into the noise field and the light
 * falloff, so the sphere's shape follows the learner's voice instead of a clock.
 */
const FRAGMENT_SHADER = `
  precision highp float;
  uniform float iTime;
  uniform vec3 iResolution;
  uniform float hue;
  uniform float hover;
  uniform float rot;
  uniform float hoverIntensity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uLow;
  uniform float uHigh;
  uniform float uSaturation;
  uniform float uOpacity;
  varying vec2 vUv;

  vec3 rgb2yiq(vec3 c) {
    float y = dot(c, vec3(0.299, 0.587, 0.114));
    float i = dot(c, vec3(0.596, -0.274, -0.322));
    float q = dot(c, vec3(0.211, -0.523, 0.312));
    return vec3(y, i, q);
  }
  vec3 yiq2rgb(vec3 c) {
    float r = c.x + 0.956 * c.y + 0.621 * c.z;
    float g = c.x - 0.272 * c.y - 0.647 * c.z;
    float b = c.x - 1.106 * c.y + 1.703 * c.z;
    return vec3(r, g, b);
  }
  vec3 adjustHue(vec3 color, float hueDeg) {
    float hueRad = hueDeg * 3.14159265 / 180.0;
    vec3 yiq = rgb2yiq(color);
    float cosA = cos(hueRad);
    float sinA = sin(hueRad);
    float i = yiq.y * cosA - yiq.z * sinA;
    float q = yiq.y * sinA + yiq.z * cosA;
    yiq.y = i; yiq.z = q;
    return yiq2rgb(yiq);
  }
  float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }
  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
    p3 += dot(p3, p3.yxz + 19.19);
    return -1.0 + 2.0 * fract(vec3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);
  }
  float snoise3(vec3 p) {
    const float K1 = 0.333333333;
    const float K2 = 0.166666667;
    vec3 i = floor(p + (p.x + p.y + p.z) * K1);
    vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
    vec3 e = step(vec3(0.0), d0 - d0.yzx);
    vec3 i1 = e * (1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    vec3 d1 = d0 - (i1 - K2);
    vec3 d2 = d0 - (i2 - K1);
    vec3 d3 = d0 - 0.5;
    vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
    vec4 n = h * h * h * h * vec4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0)));
    return dot(vec4(31.316), n);
  }
  vec4 extractAlpha(vec3 colorIn) {
    float a = max(max(colorIn.r, colorIn.g), colorIn.b);
    return vec4(colorIn.rgb / (a + 1e-5), a);
  }
  const float innerRadius = 0.6;
  const float noiseScale = 0.65;
  float light1(float intensity, float attenuation, float dist) { return intensity / (1.0 + dist * attenuation); }
  float light2(float intensity, float attenuation, float dist) { return intensity / (1.0 + dist * dist * attenuation); }
  vec4 draw(vec2 uv) {
    vec3 color1 = adjustHue(uColorA, hue);
    vec3 color2 = adjustHue(uColorB, hue);
    vec3 color3 = adjustHue(uColorC, hue);
    float ang = atan(uv.y, uv.x);
    float len = length(uv);
    float invLen = len > 0.0 ? 1.0 / len : 0.0;
    // Real low-band energy widens the noise field, so a louder voice makes a
    // visibly larger, faster-merging body.
    float n0 = snoise3(vec3(uv * (noiseScale + uLow * 0.22), iTime * (0.5 + uLow * 0.35))) * 0.5 + 0.5;
    float r0 = mix(mix(innerRadius, 1.0, 0.4), mix(innerRadius, 1.0, 0.6), n0);
    float d0 = distance(uv, (r0 * invLen) * uv);
    float v0 = light1(1.0, 10.0, d0);
    v0 *= smoothstep(r0 * 1.05, r0, len);
    float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;
    float a = iTime * -1.0;
    vec2 pos = vec2(cos(a), sin(a)) * r0;
    float d = distance(uv, pos);
    float v1 = light2(1.5 + uHigh * 0.9, 5.0, d);
    v1 *= light1(1.0, 50.0, d0);
    float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
    float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);
    vec3 col = mix(color1, color2, cl);
    col = mix(color3, col, v0);
    col = (col + v1) * v2 * v3;
    // Desaturate toward luma for the calm states (error, offline, quota): the
    // orb dims, it does not turn red.
    col = mix(vec3(luma(col)), col, uSaturation);
    col = clamp(col, 0.0, 1.0);
    return extractAlpha(col);
  }
  vec4 mainImage(vec2 fragCoord) {
    vec2 center = iResolution.xy * 0.5;
    float size = min(iResolution.x, iResolution.y);
    vec2 uv = (fragCoord - center) / size * 2.0;
    float angle = rot;
    float s = sin(angle);
    float c = cos(angle);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
    uv.x += hover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);
    uv.y += hover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);
    return draw(uv);
  }
  void main() {
    vec2 fragCoord = vUv * iResolution.xy;
    vec4 col = mainImage(fragCoord);
    gl_FragColor = vec4(col.rgb * col.a * uOpacity, col.a * uOpacity);
  }
`;

type Uniform<T> = { value: T };

interface OrbUniforms extends Record<string, unknown> {
  iTime: Uniform<number>;
  iResolution: Uniform<Vec3>;
  hue: Uniform<number>;
  hover: Uniform<number>;
  rot: Uniform<number>;
  hoverIntensity: Uniform<number>;
  uColorA: Uniform<Vec3>;
  uColorB: Uniform<Vec3>;
  uColorC: Uniform<Vec3>;
  uLow: Uniform<number>;
  uHigh: Uniform<number>;
  uSaturation: Uniform<number>;
  uOpacity: Uniform<number>;
}

export const VoicePoweredOrb: React.FC<VoicePoweredOrbProps> = ({
  state,
  amplitude,
  bands,
  readLevel,
  tone = 'lavender',
  motionScale = 1,
  size = 118,
  className,
  onFailure,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  // Frame-loop inputs live in refs: a state change must never rebuild the
  // program or reset the rotation.
  const stateRef = useRef(state);
  const toneRef = useRef(tone);
  const amplitudeRef = useRef(amplitude);
  const bandsRef = useRef(bands);
  const motionRef = useRef(motionScale);
  const failureRef = useRef(onFailure);
  const readLevelRef = useRef(readLevel);
  stateRef.current = state;
  toneRef.current = tone;
  amplitudeRef.current = amplitude;
  bandsRef.current = bands;
  motionRef.current = motionScale;
  failureRef.current = onFailure;
  readLevelRef.current = readLevel;

  const fail = useCallback(() => {
    setFailed((already) => {
      if (already) return already;
      failureRef.current();
      return true;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || failed) return;

    let renderer: Renderer | null = null;
    let program: Program | null = null;
    let geometry: Triangle | null = null;
    let frame = 0;
    let stopped = false;
    let disposed = false;

    const stopLoop = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const startLoop = (tick: FrameRequestCallback) => {
      if (stopped || frame) return;
      frame = requestAnimationFrame(tick);
    };

    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: false, antialias: true, dpr: Math.min(2, window.devicePixelRatio || 1) });
      const context = renderer.gl;
      context.clearColor(0, 0, 0, 0);
      context.enable(context.BLEND);
      context.blendFunc(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA);

      while (container.firstChild) container.removeChild(container.firstChild);
      container.appendChild(context.canvas);

      const uniforms: OrbUniforms = {
        iTime: { value: 0 },
        iResolution: { value: new Vec3(context.canvas.width, context.canvas.height, 1) },
        hue: { value: 0 },
        hover: { value: 0 },
        rot: { value: 0 },
        hoverIntensity: { value: 0 },
        uColorA: { value: new Vec3(...LAVENDER) },
        uColorB: { value: new Vec3(...SILVER) },
        uColorC: { value: new Vec3(...DEEP) },
        uLow: { value: 0 },
        uHigh: { value: 0 },
        uSaturation: { value: 1 },
        uOpacity: { value: 1 },
      };

      geometry = new Triangle(context);
      program = new Program(context, {
        vertex: VERTEX_SHADER,
        fragment: FRAGMENT_SHADER,
        uniforms,
      });
      const mesh = new Mesh(context, { geometry, program });

      const resize = () => {
        if (!renderer || !context || !program) return;
        const rect = container.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        renderer.setSize(width * dpr, height * dpr);
        context.canvas.style.width = `${width}px`;
        context.canvas.style.height = `${height}px`;
        uniforms.iResolution.value.set(context.canvas.width, context.canvas.height, 1);
      };
      resize();
      window.addEventListener('resize', resize);

      let lastTime = 0;
      let currentRot = 0;
      let voiceLevel = 0;
      let low = 0;
      let high = 0;
      let elapsed = 0;
      const palette = [new Vec3(...LAVENDER), new Vec3(...SILVER), new Vec3(...DEEP)];
      const earned = new Vec3(...MAGENTA);

      function update(now: number) {
        frame = 0;
        if (disposed || !renderer || !context || !program) return;
        try {
          const dt = Math.min(0.05, Math.max(0, (now - lastTime) * 0.001));
          lastTime = now;
          const motion = motionRef.current;
          const recipe = stateMotion(stateRef.current);
          const live = readLevelRef.current?.();
          const sample = live ? live.amplitude : amplitudeRef.current;
          const bandSample = live ? live.bands : bandsRef.current;

          // Reduced motion freezes the drift but keeps the voice response, so the
          // orb still answers the learner without swirling at them.
          elapsed += dt * recipe.speed * motion;
          uniforms.iTime.value = elapsed;

          // Amplitude is read from the app's own stream — the same numbers the 2D
          // body and the orb button's state already use.
          const target = Math.min(1, sample * recipe.energy);
          voiceLevel += (target - voiceLevel) * (target > voiceLevel ? 0.4 : 0.08);
          low += (bandSample[0] - low) * 0.2;
          high += ((bandSample[2] + bandSample[3]) * 0.5 - high) * 0.2;

          if (voiceLevel > 0.02) currentRot += dt * (0.3 + voiceLevel * 1.6) * recipe.spin * motion;

          uniforms.hover.value = Math.min(voiceLevel * 2, 1);
          uniforms.hoverIntensity.value = Math.min(voiceLevel * 0.8, 0.8);
          uniforms.uLow.value = low;
          uniforms.uHigh.value = high;
          uniforms.uSaturation.value = recipe.saturation;
          uniforms.uOpacity.value = stateRef.current === 'error' || stateRef.current === 'offline' ? 0.62 : 1;

          // Magenta is earned-only, and never while the learner is being told
          // something went wrong.
          const useEarned =
            toneRef.current === 'earned' &&
            stateRef.current !== 'error' &&
            stateRef.current !== 'offline' &&
            stateRef.current !== 'quota';
          uniforms.uColorA.value.copy(useEarned ? earned : palette[0]);
          uniforms.rot.value = currentRot;

          context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT);
          renderer.render({ scene: mesh });

          if (!stopped) frame = requestAnimationFrame(update);
        } catch (error) {
          // A throw inside a WebGL frame is a dead canvas. Stop, and hand the orb
          // back to the 2D body rather than leaving a frozen sphere.
          console.error('[KatzuOrb] WebGL frame failed', error);
          stopLoop();
          fail();
        }
      }

      const onVisibility = () => {
        stopped = document.hidden;
        if (stopped) stopLoop();
        else {
          lastTime = performance.now();
          startLoop(update);
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      // A GPU reset, a driver crash or a browser-evicted context leaves a canvas
      // that accepts every call and draws nothing — no throw, so the frame loop
      // would keep rendering into it forever and the orb would simply be blank.
      // Hand the body back to the caller's 2D canvas instead. The event is not
      // cancelled: we want the context to stay gone, not to be restored behind a
      // body that has already been swapped out.
      const onContextLost = () => {
        console.error('[KatzuOrb] WebGL context lost, falling back to the 2D body');
        stopLoop();
        fail();
      };
      context.canvas.addEventListener('webglcontextlost', onContextLost);

      frame = requestAnimationFrame(update);

      return () => {
        disposed = true;
        stopLoop();
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', onVisibility);
        context.canvas.removeEventListener('webglcontextlost', onContextLost);
        if (container.contains(context.canvas)) {
          try {
            container.removeChild(context.canvas);
          } catch {
            /* the canvas is already gone; nothing to release */
          }
        }
        program?.remove?.();
        geometry?.remove?.();
        // The program and geometry are what hold GPU memory, and removing them is
        // cheap. The context is deliberately *not* force-lost: measured at 9,303 ms
        // of synchronous main-thread work on a software rasteriser (48.6 s with the
        // CPU contended), which is a frozen screen every time a learner leaves the
        // live conversation. Removing the canvas releases it — see SiriWave's header
        // note, which measured the same call.
        program = null;
        geometry = null;
        renderer = null;
      };
    } catch (error) {
      console.error('[KatzuOrb] WebGL unavailable, falling back to the 2D body', error);
      stopLoop();
      fail();
      return;
    }
    // `failed` is read once: after a failure the caller has swapped the body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fail, failed]);

  if (failed) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={className}
      style={{ width: size, height: size, position: 'absolute', inset: 0 }}
    />
  );
};

export default VoicePoweredOrb;
