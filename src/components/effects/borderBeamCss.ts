/**
 * BorderBeam's CSS generator, ported for Katzu.
 *
 * Two deliberate reductions from the source component, both to keep one truth in
 * the design system:
 *
 *  - **Two variants, not five.** The reference ships `sm`, `md`, `line`,
 *    `pulse-inner` and `pulse-outside`. This app has exactly two beam roles — an
 *    ambient breathe on glass at rest (`pulse-outside`) and a travelling trace on
 *    the active state of a control (`line`) — so the other three are not ported
 *    rather than shipped unused.
 *  - **Two colours, generated.** The reference hardcodes five palettes of nine
 *    gradients each. Here the *geometry* is kept verbatim from the reference (that
 *    is what makes it look right) and the colour comes from one palette pair, so
 *    "lavender normally, magenta when earned" cannot drift into a third hue.
 *
 * Dark only: this app is AMOLED black with no light theme, so a light branch would
 * be untested code pretending to be a feature.
 *
 * V34: the ambient role is **painted, not animated**. It used to run a shared
 * 30fps rAF driver that wrote seventeen custom properties per mounted beam,
 * forever, to breathe nine radial gradients — measured on the production bundle
 * as 100ms of style recalculation in five idle seconds, on the one screen that
 * carries it, on a phone with nothing else running. The edge is now a single
 * 600ms fade-in and then nothing, which is the same picture at rest and no
 * loop. The *active* role keeps its travelling comet: that one is a control the
 * learner is holding, it is pure CSS (so it never touches the main thread), and
 * the motion means "engaged".
 */

/**
 * The beam's bloom and mask gradients are pure white with an alpha. That is
 * deliberate and is *not* a missing design token: the white is a light source
 * that the beam's palette then tints, so baking it to `--kz-ink` (a warm
 * off-white) would drag every beam toward amber. It stays neutral by design.
 *
 * Naming it here keeps the six gradient call sites below readable and records
 * the reason in one place instead of six.
 */
const WHITE = '#fff'; // design-audit: allow — a neutral light source, not a theme colour

/** Neutral white at a given alpha, for bloom falloff and CSS masks. */
const bloom = (alpha: number) => `rgba(255,255,255,${alpha})`; // design-audit: allow — see WHITE

/**
 * Motion is slowed rather than removed — for the one role that still moves.
 * The ambient role has nothing left to slow: it is a painted edge.
 */
export const REDUCED_MOTION_SCALE = 3;

/** Which of the two colours a beam is allowed to use. */
export type BeamPalette = 'lavender' | 'earned';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Katzu's tokens. Lavender is the normal accent; magenta is earned-only. */
const PALETTES: Record<BeamPalette, { base: Rgb; accent: Rgb; deep: Rgb }> = {
  lavender: {
    base: { r: 180, g: 160, b: 255 },
    accent: { r: 228, g: 226, b: 245 },
    deep: { r: 124, g: 92, b: 240 },
  },
  earned: {
    // Mirrors --kz-magenta / --kz-magenta-deep. A canvas string cannot read a
    // CSS variable, so these three numbers are a copy — pinned against
    // src/index.css by tests/designSystem.test.ts.
    base: { r: 174, g: 123, b: 255 },
    accent: { r: 214, g: 200, b: 250 },
    deep: { r: 115, g: 67, b: 222 },
  },
};

/**
 * The nine-gradient ring geometry, verbatim from the reference.
 *
 * Index order matters: the breathe tables below address these by index, so the
 * ring's motion and the trace's travelling comet stay in the positions the
 * original component tuned.
 */
const RING = [
  { pos: '12% 1%', size: '130px 65px' },
  { pos: '33% 0%', size: '150px 75px' },
  { pos: '2.1% 68.3%', size: '46px 130px' },
  { pos: '2.1% 68.3%', size: '24px 68px' },
  { pos: '74.4% 100%', size: '280px 56px' },
  { pos: '55% 100%', size: '150px 50px' },
  { pos: '93.9% 1%', size: '150px 82px' },
  { pos: '100% 27.1%', size: '30px 80px' },
  { pos: '100% 27.1%', size: '56px 92px' },
] as const;

/** Where each ring stop sits once the comet starts travelling. */
const TRACE = [
  { sizeW: 36, sizeH: 36, offsetX: 0, offsetY: 2 },
  { sizeW: 30, sizeH: 32, offsetX: 39, offsetY: 0 },
  { sizeW: 33, sizeH: 28, offsetX: -36, offsetY: 2 },
  { sizeW: 29, sizeH: 34, offsetX: -54, offsetY: 0 },
  { sizeW: 27, sizeH: 30, offsetX: 51, offsetY: -1 },
  { sizeW: 36, sizeH: 24, offsetX: 21, offsetY: 1 },
  { sizeW: 30, sizeH: 22, offsetX: -21, offsetY: 0 },
  { sizeW: 25, sizeH: 28, offsetX: 66, offsetY: 1 },
  { sizeW: 23, sizeH: 30, offsetX: -66, offsetY: -1 },
] as const;

/** Inner trace stops, with the reference's own smaller sizes. */
const TRACE_INNER = [
  { sizeW: 33, sizeH: 30, offsetX: 0, offsetY: 0 },
  { sizeW: 24, sizeH: 26, offsetX: 39, offsetY: -3 },
  { sizeW: 27, sizeH: 24, offsetX: -36, offsetY: 0 },
  { sizeW: 23, sizeH: 28, offsetX: -54, offsetY: -2 },
  { sizeW: 24, sizeH: 24, offsetX: 51, offsetY: -1 },
  { sizeW: 30, sizeH: 20, offsetX: 21, offsetY: 0 },
  { sizeW: 25, sizeH: 18, offsetX: -21, offsetY: -2 },
  { sizeW: 21, sizeH: 24, offsetX: 66, offsetY: 0 },
  { sizeW: 18, sizeH: 26, offsetX: -66, offsetY: -1 },
] as const;

function rgb({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function rgba({ r, g, b }: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Which colour ring stop `index` wears.
 *
 * The reference alternates emphasis across the nine stops; this keeps that
 * alternation and maps it onto three tokens instead of nine literals.
 */
function stopColor(palette: BeamPalette, index: number): Rgb {
  const { base, accent, deep } = PALETTES[palette];
  if (index === 1 || index === 5) return accent;
  if (index === 3 || index === 8) return deep;
  return base;
}

/** The nine radial gradients that make the ring, at rest. */
function ringGradients(palette: BeamPalette): string {
  return RING.map((stop, index) => `radial-gradient(ellipse ${stop.size} at ${stop.pos}, ${rgb(stopColor(palette, index))}, transparent)`).join(',');
}

/** The same ring, softened the way the reference softens its inner core. */
function coreGradients(palette: BeamPalette): string {
  return RING.map((stop, index) => {
    const smaller = stop.size
      .split(' ')
      .map((part) => `${Math.round(parseFloat(part) * 0.9)}px`)
      .join(' ');
    return `radial-gradient(ellipse ${smaller} at ${stop.pos}, ${rgba(stopColor(palette, index), 0.45)}, transparent)`;
  }).join(',');
}

/** A travelling stop: position and size come from the comet's current progress. */
function traceStop(palette: BeamPalette, index: number, id: string, inner: boolean): string {
  const geometry = inner ? TRACE_INNER[index] : TRACE[index];
  const offsetX = geometry.offsetX === 0 ? '' : ` ${geometry.offsetX > 0 ? '+' : '-'} ${Math.abs(geometry.offsetX)}px`;
  const offsetY = geometry.offsetY === 0 ? '' : ` ${geometry.offsetY > 0 ? '+' : '-'} ${Math.abs(geometry.offsetY)}px`;
  const alpha = inner ? 0.45 : 1;
  return `radial-gradient(ellipse calc(${geometry.sizeW}px * var(--rim-w-${id})) calc(${geometry.sizeH}px * var(--rim-h-${id})) at calc(var(--rim-x-${id}) * 100%${offsetX}) calc(100%${offsetY}), ${rgba(stopColor(palette, index), alpha)}, transparent)`;
}

/** The options both roles are generated from. */
export interface BeamCssOptions {
  id: string;
  variant: 'pulse-outside' | 'line';
  palette: BeamPalette;
  borderRadius: number;
  borderWidth: number;
  duration: number;
  strength: number;
}

/**
 * The one property the ambient edge animates: a single 600ms fade from nothing
 * to lit, registered so it interpolates as a number. It was one of seventeen
 * before V34; the other sixteen were the breathe.
 */
function fadeProperty(id: string): string {
  return `@property --rim-opacity-${id} {\n  syntax: "<number>";\n  initial-value: 0;\n  inherits: true;\n}`;
}

/** The travelling comet's own registered properties (the active role only). */
function traceProperties(id: string): string {
  return `
@property --rim-x-${id} { syntax: "<number>"; initial-value: 0; inherits: true; }
@property --rim-w-${id} { syntax: "<number>"; initial-value: 1; inherits: true; }
@property --rim-h-${id} { syntax: "<number>"; initial-value: 1; inherits: true; }
@property --rim-spike-${id} { syntax: "<number>"; initial-value: 1; inherits: true; }
@property --rim-spike2-${id} { syntax: "<number>"; initial-value: 1; inherits: true; }
@property --rim-edge-${id} { syntax: "<number>"; initial-value: 1; inherits: true; }
${fadeProperty(id)}`;
}

function frozenAnimRule(id: string): string {
  return `
[data-rim="${id}"][data-paused],
[data-rim="${id}"][data-paused]::after,
[data-rim="${id}"][data-paused]::before,
[data-rim="${id}"][data-paused] [data-rim-glow] {
  animation-play-state: paused !important;
}`;
}

/**
 * Reduced motion slows the *loop* rather than removing the beam.
 *
 * Only the active role has a loop left; a learner who has asked for calm gets a
 * slower comet instead of a strobe — not a missing surface. The ambient edge is
 * already still, so it needs nothing here.
 */
function reducedMotionRule(id: string): string {
  return `
@media (prefers-reduced-motion: reduce) {
  [data-rim="${id}"] {
    --rim-motion-scale: ${REDUCED_MOTION_SCALE};
  }
}`;
}

function motionDur(seconds: number): string {
  return `calc(${seconds}s * var(--rim-motion-scale, 1))`;
}

const MASK_RING = (id: string) =>
  `linear-gradient(${WHITE} 0 0) content-box, linear-gradient(${WHITE} 0 0)`;
const MASK_COMET = (id: string) => `radial-gradient(
      ellipse calc(78px * var(--rim-w-${id})) calc(60px * var(--rim-h-${id})) at calc(var(--rim-x-${id}) * 100%) 100%,
      white 0%, ${bloom(0.5)} 45%, transparent 100%
    )`;

/**
 * The ambient layer: the lit edge of a glass surface at rest.
 *
 * Painted once. Three layers exactly as before — the 1px ring, an inner wash and
 * an outer bloom — but with the ring's nine stops at their resting geometry
 * instead of positions a timer was rewriting thirty times a second. The single
 * animation left is the 600ms fade-in, so the material *arrives* rather than
 * snapping on.
 */
function pulseOutsideCss({ id, palette, borderRadius, strength }: BeamCssOptions): string {
  const strokeOpacity = 0.94;
  const innerOpacity = 0.34;
  const bloomOpacity = 0.3;
  const brightness = 1.9;
  const saturation = 1.2;
  return `
${fadeProperty(id)}

[data-rim="${id}"] { position: relative; border-radius: ${borderRadius}px; overflow: visible; isolation: isolate; }
[data-rim="${id}"][data-active] { animation: rim-fade-in-${id} 600ms ease forwards; }
[data-rim="${id}"][data-fading] { animation: rim-fade-out-${id} 500ms ease forwards; }

[data-rim="${id}"][data-active]::after, [data-rim="${id}"][data-fading]::after {
  content: ""; position: absolute; inset: 0; border-radius: ${borderRadius}px; padding: 1px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${ringGradients(palette)};
  -webkit-mask: ${MASK_RING(id)};
  -webkit-mask-composite: xor;
  mask: ${MASK_RING(id)};
  mask-composite: exclude;
  pointer-events: none; z-index: 2;
  opacity: calc(var(--rim-opacity-${id}) * ${strokeOpacity} * var(--rim-stroke-opacity, 1) * var(--rim-strength, ${strength}));
  filter: brightness(${brightness}) saturate(${saturation});
}

[data-rim="${id}"][data-active]::before, [data-rim="${id}"][data-fading]::before {
  content: ""; position: absolute; inset: -10px; z-index: -1; border-radius: ${borderRadius + 10}px;
  background: ${coreGradients(palette)};
  transform: scale(0.95, 0.9);
  pointer-events: none;
  opacity: calc(var(--rim-opacity-${id}) * ${innerOpacity} * var(--rim-inner-opacity, 1) * var(--rim-strength, ${strength}));
  filter: blur(3px) brightness(${brightness}) saturate(${saturation});
}

[data-rim="${id}"] [data-rim-glow] {
  display: none; position: absolute; inset: -30px; z-index: -1; border-radius: ${borderRadius + 30}px;
  background: ${ringGradients(palette)};
  transform: scale(0.95, 0.9);
  pointer-events: none; opacity: 0;
}

[data-rim="${id}"][data-active] [data-rim-glow], [data-rim="${id}"][data-fading] [data-rim-glow] {
  display: block;
  opacity: calc(var(--rim-opacity-${id}) * ${bloomOpacity} * var(--rim-bloom-opacity, 1) * var(--rim-strength, ${strength}));
  filter: blur(22.5px) brightness(${brightness}) saturate(${saturation});
}

@keyframes rim-fade-in-${id} { to { --rim-opacity-${id}: 1; } }
@keyframes rim-fade-out-${id} { from { --rim-opacity-${id}: 1; } to { --rim-opacity-${id}: 0; } }
`;
}

/** The active layer: a comet that travels the bottom edge of a control. */
function lineCss({ id, palette, borderRadius, borderWidth, duration, strength }: BeamCssOptions): string {
  const strokeOpacity = 1.14;
  const innerOpacity = 0.7;
  const bloomOpacity = 0.8;
  const brightness = 1.3;
  const saturation = 1.2;
  const innerRadius = Math.max(0, borderRadius - borderWidth);
  return `
${traceProperties(id)}

[data-rim="${id}"] { position: relative; border-radius: ${borderRadius}px; overflow: hidden; }

[data-rim="${id}"][data-active] {
  animation:
    rim-travel-${id} ${motionDur(duration)} linear infinite,
    rim-edge-fade-${id} ${motionDur(duration)} linear infinite,
    rim-breathe-${id} ${motionDur(duration * 1.3)} ease-in-out infinite,
    rim-spike-${id} ${motionDur(duration * 1.33)} ease-in-out infinite,
    rim-spike2-${id} ${motionDur(duration * 1.7)} ease-in-out infinite,
    rim-fade-in-${id} ${motionDur(0.6)} ease forwards;
}

[data-rim="${id}"][data-fading] {
  animation:
    rim-travel-${id} ${motionDur(duration)} linear infinite,
    rim-edge-fade-${id} ${motionDur(duration)} linear infinite,
    rim-breathe-${id} ${motionDur(duration * 1.3)} ease-in-out infinite,
    rim-spike-${id} ${motionDur(duration * 1.33)} ease-in-out infinite,
    rim-spike2-${id} ${motionDur(duration * 1.7)} ease-in-out infinite,
    rim-fade-out-${id} ${motionDur(0.5)} ease forwards;
}

[data-rim="${id}"][data-active]::after, [data-rim="${id}"][data-fading]::after {
  content: ""; position: absolute; inset: 0; border-radius: ${innerRadius}px; padding: ${borderWidth}px;
  clip-path: inset(0 round ${borderRadius}px);
  background:
    radial-gradient(ellipse calc(24px * var(--rim-w-${id})) calc(28px * var(--rim-h-${id})) at calc(var(--rim-x-${id}) * 100%) calc(100% + 2px), ${bloom(0.38)} 0%, ${bloom(0.12)} 30%, transparent 65%),
    ${RING.map((_, index) => traceStop(palette, index, id, false)).join(',')};
  -webkit-mask: ${MASK_COMET(id)}, ${MASK_RING(id)};
  -webkit-mask-composite: source-in, xor;
  mask: ${MASK_COMET(id)}, ${MASK_RING(id)};
  mask-composite: intersect, exclude;
  pointer-events: none; z-index: 2;
  opacity: calc(var(--rim-opacity-${id}) * var(--rim-edge-${id}) * ${strokeOpacity} * var(--rim-stroke-opacity, 1) * var(--rim-strength, ${strength}));
  filter: brightness(${brightness}) saturate(${saturation});
}

[data-rim="${id}"][data-active]::before, [data-rim="${id}"][data-fading]::before {
  content: ""; position: absolute; inset: 0; border-radius: ${borderRadius}px;
  background: ${RING.map((_, index) => traceStop(palette, index, id, true)).join(',')};
  box-shadow: inset 0 0 9px 1px ${bloom(0.1)};
  -webkit-mask-image: ${MASK_COMET(id)},
    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),
    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);
  -webkit-mask-composite: source-in, source-over;
  mask-image: ${MASK_COMET(id)},
    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),
    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);
  mask-composite: intersect, add;
  pointer-events: none; z-index: 1;
  opacity: calc(var(--rim-opacity-${id}) * var(--rim-edge-${id}) * ${innerOpacity} * var(--rim-inner-opacity, 1) * var(--rim-strength, ${strength}));
  clip-path: inset(0 round ${borderRadius}px);
  filter: brightness(${brightness}) saturate(${saturation});
}

[data-rim="${id}"] [data-rim-glow] {
  display: none; position: absolute; inset: 0; border-radius: ${innerRadius}px;
  clip-path: inset(0 round ${borderRadius}px);
  padding: 0;
  -webkit-mask: radial-gradient(
    ellipse calc(84px * var(--rim-w-${id})) calc(110px * var(--rim-h-${id})) at calc(var(--rim-x-${id}) * 100%) 100%,
    white 0%, ${bloom(0.5)} 35%, transparent 100%
  );
  mask: radial-gradient(
    ellipse calc(84px * var(--rim-w-${id})) calc(110px * var(--rim-h-${id})) at calc(var(--rim-x-${id}) * 100%) 100%,
    white 0%, ${bloom(0.5)} 35%, transparent 100%
  );
  background: ${RING.map((_, index) => {
    const { r, g, b } = stopColor(palette, index);
    return `radial-gradient(ellipse calc(${TRACE[index].sizeW}px * var(--rim-w-${id})) calc(${TRACE[index].sizeH}px * var(--rim-h-${id})) at calc(var(--rim-x-${id}) * 100%) 100%, ${rgba({ r, g, b }, 0.5)}, transparent)`;
  }).join(',')};
  pointer-events: none; z-index: 3; opacity: 0;
  filter: blur(8px) brightness(${brightness}) saturate(${saturation});
}

[data-rim="${id}"][data-active] [data-rim-glow], [data-rim="${id}"][data-fading] [data-rim-glow] {
  display: block;
  opacity: calc(var(--rim-opacity-${id}) * var(--rim-edge-${id}) * ${bloomOpacity} * var(--rim-bloom-opacity, 1) * var(--rim-strength, ${strength}));
}

@keyframes rim-travel-${id} {
  0%   { --rim-x-${id}: 0.06; --rim-w-${id}: 0.5; }
  10%  { --rim-x-${id}: 0.15; --rim-w-${id}: 0.8; }
  20%  { --rim-x-${id}: 0.25; --rim-w-${id}: 1.1; }
  30%  { --rim-x-${id}: 0.35; --rim-w-${id}: 1.3; }
  40%  { --rim-x-${id}: 0.44; --rim-w-${id}: 1.45; }
  50%  { --rim-x-${id}: 0.5;  --rim-w-${id}: 1.5; }
  60%  { --rim-x-${id}: 0.56; --rim-w-${id}: 1.45; }
  70%  { --rim-x-${id}: 0.65; --rim-w-${id}: 1.3; }
  80%  { --rim-x-${id}: 0.75; --rim-w-${id}: 1.1; }
  90%  { --rim-x-${id}: 0.85; --rim-w-${id}: 0.8; }
  100% { --rim-x-${id}: 0.94; --rim-w-${id}: 0.5; }
}

@keyframes rim-edge-fade-${id} {
  0%    { --rim-edge-${id}: 0; }
  12.5% { --rim-edge-${id}: 0; }
  32.5% { --rim-edge-${id}: 1; }
  67.5% { --rim-edge-${id}: 1; }
  87.5% { --rim-edge-${id}: 0; }
  100%  { --rim-edge-${id}: 0; }
}

@keyframes rim-breathe-${id} {
  0%, 100% { --rim-h-${id}: 0.8; }
  25%      { --rim-h-${id}: 1.25; }
  55%      { --rim-h-${id}: 0.85; }
  80%      { --rim-h-${id}: 1.3; }
}

@keyframes rim-spike-${id} {
  0%   { --rim-spike-${id}: 0.8; }
  25%  { --rim-spike-${id}: 1.3; }
  50%  { --rim-spike-${id}: 0.9; }
  75%  { --rim-spike-${id}: 1.4; }
  100% { --rim-spike-${id}: 0.8; }
}

@keyframes rim-spike2-${id} {
  0%   { --rim-spike2-${id}: 1.2; }
  25%  { --rim-spike2-${id}: 0.7; }
  50%  { --rim-spike2-${id}: 1.4; }
  75%  { --rim-spike2-${id}: 0.8; }
  100% { --rim-spike2-${id}: 1.2; }
}

@keyframes rim-fade-in-${id} { to { --rim-opacity-${id}: 1; } }
@keyframes rim-fade-out-${id} { from { --rim-opacity-${id}: 1; } to { --rim-opacity-${id}: 0; } }
${frozenAnimRule(id)}
${reducedMotionRule(id)}
`;
}

export function buildBeamCss(options: BeamCssOptions): string {
  return options.variant === 'line' ? lineCss(options) : pulseOutsideCss(options);
}

