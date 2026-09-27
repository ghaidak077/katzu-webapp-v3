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
 */

/** Motion is slowed rather than removed: the beam is information, not decoration. */
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
    base: { r: 255, g: 111, b: 216 },
    accent: { r: 255, g: 190, b: 240 },
    deep: { r: 226, g: 63, b: 174 },
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

/** The ambient breathe: where each blob sits while the ring is at rest. */
const BREATHE_CORE = [
  { ci: 0, region: 1, quad: 'tl', w: 80, h: 19, x: '27%', y: '0%' },
  { ci: 6, region: 2, quad: 'tr', w: 74, h: 11, x: '73%', y: '-1%' },
  { ci: 7, region: 3, quad: 'tr', w: 15, h: 44, x: '100%', y: '33%' },
  { ci: 8, region: 1, quad: 'br', w: 19, h: 38, x: '101%', y: '72%' },
  { ci: 4, region: 2, quad: 'br', w: 84, h: 13, x: '67%', y: '100%' },
  { ci: 1, region: 3, quad: 'bl', w: 60, h: 21, x: '24%', y: '101%' },
  { ci: 2, region: 1, quad: 'bl', w: 17, h: 40, x: '0%', y: '60%' },
  { ci: 3, region: 2, quad: 'tl', w: 13, h: 32, x: '-1%', y: '28%' },
] as const;

/** The outward bloom behind the core, at the reference's wider sizes. */
const BREATHE_BLOOM = [
  { ci: 0, region: 1, quad: 'tl', w: 110, h: 30, x: '27%', y: '3%' },
  { ci: 6, region: 2, quad: 'tr', w: 100, h: 20, x: '73%', y: '1%' },
  { ci: 7, region: 3, quad: 'tr', w: 26, h: 62, x: '100%', y: '33%' },
  { ci: 8, region: 1, quad: 'br', w: 30, h: 56, x: '101%', y: '72%' },
  { ci: 4, region: 2, quad: 'br', w: 120, h: 22, x: '67%', y: '99%' },
  { ci: 1, region: 3, quad: 'bl', w: 88, h: 32, x: '24%', y: '99%' },
  { ci: 2, region: 1, quad: 'bl', w: 28, h: 58, x: '0%', y: '60%' },
] as const;

const REGION_QUAD = [
  { region: 1, quad: 'tl' },
  { region: 2, quad: 'tl' },
  { region: 3, quad: 'bl' },
  { region: 1, quad: 'bl' },
  { region: 2, quad: 'br' },
  { region: 3, quad: 'br' },
  { region: 1, quad: 'tr' },
  { region: 2, quad: 'tr' },
  { region: 3, quad: 'tr' },
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

function breatheStop(palette: BeamPalette, id: string, entry: (typeof BREATHE_CORE)[number] | (typeof BREATHE_BLOOM)[number], staticAlpha?: number): string {
  const { r, g, b } = stopColor(palette, entry.ci);
  const x = 'x' in entry ? entry.x : '0%';
  const y = 'y' in entry ? entry.y : '0%';
  const alpha = staticAlpha === undefined ? `var(--qop-${entry.quad}-${id})` : staticAlpha.toFixed(3);
  return `radial-gradient(ellipse calc(${entry.w}px * var(--qw${entry.region}-${id}) * var(--pulse-scale-x, 1) * var(--pulse-boost, 1)) calc(${entry.h}px * var(--qh${entry.region}-${id}) * var(--qgh-${id}) * var(--pulse-scale-y, 1) * var(--pulse-boost, 1)) at calc(${x} + var(--qx${entry.region}-${id})) calc(${y} + var(--qy${entry.region}-${id})), rgba(${r}, ${g}, ${b}, ${alpha}), transparent)`;
}

/** The ambient ring, at rest: nine blobs that breathe outward. */
function breatheRing(palette: BeamPalette, id: string): string {
  return RING.map((stop, index) => {
    const { region, quad } = REGION_QUAD[index];
    const [x, y] = stop.pos.split(' ');
    const [w, h] = stop.size.split(' ').map(parseFloat);
    const { r, g, b } = stopColor(palette, index);
    return `radial-gradient(ellipse calc(${w}px * var(--qw${region}-${id}) * var(--pulse-scale-x, 1) * var(--pulse-boost, 1)) calc(${h}px * var(--qh${region}-${id}) * var(--qgh-${id}) * var(--pulse-scale-y, 1) * var(--pulse-boost, 1)) at calc(${x} + var(--qx${region}-${id})) calc(${y} + var(--qy${region}-${id})), rgba(${r}, ${g}, ${b}, var(--qop-${quad}-${id})), transparent)`;
  }).join(',');
}

const DUR_SCALE = (duration: number) => duration / 2.3;

/** The waveform the pulse driver animates: same shape and phases as the reference. */
export interface PulseOscillator {
  prop: string;
  a: number;
  b: number;
  period: number;
  delay: number;
  unit: string;
}

export interface PulseDriverConfig {
  oscillators: PulseOscillator[];
}

export function buildPulseConfig(duration: number, id: string, reduced: boolean): PulseDriverConfig {
  const scale = DUR_SCALE(duration);
  const sp = 0.28;
  const dr = 14;
  const op = 0.46;
  const gh = 0.16;
  const bs = 2.3 * scale;
  const ss = 6.4 * scale;
  const ghs = 2.4 * scale;
  const motion = reduced ? REDUCED_MOTION_SCALE : 1;
  const oscillators: PulseOscillator[] = [
    { prop: `--qw1-${id}`, a: 1 - sp, b: 1 + sp * 1.1, period: ss * 0.9 * motion, delay: 0, unit: '' },
    { prop: `--qh1-${id}`, a: 1 + sp * 0.9, b: 1 - sp * 0.85, period: ss * 1.26 * motion, delay: 0, unit: '' },
    { prop: `--qx1-${id}`, a: -dr, b: dr * 0.9, period: bs * 1.6 * motion, delay: 0, unit: 'px' },
    { prop: `--qy1-${id}`, a: dr * 0.55, b: -dr * 0.7, period: bs * 1.6 * motion, delay: 0, unit: 'px' },
    { prop: `--qw2-${id}`, a: 1 + sp, b: 1 - sp * 0.85, period: ss * 1.1 * motion, delay: 0, unit: '' },
    { prop: `--qh2-${id}`, a: 1 - sp * 0.8, b: 1 + sp * 1.05, period: ss * 0.81 * motion, delay: 0, unit: '' },
    { prop: `--qx2-${id}`, a: dr * 0.8, b: -dr * 0.9, period: bs * 1.88 * motion, delay: 0, unit: 'px' },
    { prop: `--qy2-${id}`, a: -dr, b: dr * 0.65, period: bs * 1.88 * motion, delay: 0, unit: 'px' },
    { prop: `--qw3-${id}`, a: 1 - sp * 0.6, b: 1 + sp * 1.15, period: ss * 0.98 * motion, delay: 0, unit: '' },
    { prop: `--qh3-${id}`, a: 1 + sp * 0.75, b: 1 - sp, period: ss * 1.4 * motion, delay: 0, unit: '' },
    { prop: `--qx3-${id}`, a: -dr * 0.6, b: dr, period: bs * 1.45 * motion, delay: 0, unit: 'px' },
    { prop: `--qy3-${id}`, a: -dr * 0.85, b: dr * 0.45, period: bs * 1.45 * motion, delay: 0, unit: 'px' },
    { prop: `--qgh-${id}`, a: 1 - gh, b: 1 + gh, period: ghs * motion, delay: 0, unit: '' },
    { prop: `--qop-tl-${id}`, a: 1 - op, b: 1, period: bs * motion, delay: 0, unit: '' },
    { prop: `--qop-tr-${id}`, a: 1 - op, b: 1, period: bs * 1.32 * motion, delay: bs * 0.28, unit: '' },
    { prop: `--qop-bl-${id}`, a: 1 - op, b: 1, period: bs * 0.84 * motion, delay: bs * 0.55, unit: '' },
    { prop: `--qop-br-${id}`, a: 1 - op, b: 1, period: bs * 1.58 * motion, delay: bs * 0.83, unit: '' },
  ];
  return { oscillators };
}

export interface BeamCssOptions {
  id: string;
  variant: 'pulse-outside' | 'line';
  palette: BeamPalette;
  borderRadius: number;
  borderWidth: number;
  duration: number;
  strength: number;
}

function propertyRegs(id: string, breathe: boolean): string {
  if (!breathe) {
    return `
@property --rim-x-${id} { syntax: "<number>"; initial-value: 0; inherits: true; }
@property --rim-w-${id} { syntax: "<number>"; initial-value: 1; inherits: true; }
@property --rim-h-${id} { syntax: "<number>"; initial-value: 1; inherits: true; }
@property --rim-spike-${id} { syntax: "<number>"; initial-value: 1; inherits: true; }
@property --rim-spike2-${id} { syntax: "<number>"; initial-value: 1; inherits: true; }
@property --rim-edge-${id} { syntax: "<number>"; initial-value: 1; inherits: true; }
@property --rim-opacity-${id} { syntax: "<number>"; initial-value: 0; inherits: true; }`;
  }
  const numbers = ['bw1', 'bh1', 'bw2', 'bh2', 'bw3', 'bh3', 'bgh', 'bop-tl', 'bop-tr', 'bop-bl', 'bop-br'];
  const lengths = ['bx1', 'by1', 'bx2', 'by2', 'bx3', 'by3'];
  return [
    ...numbers.map((name) => `@property --${name}-${id} {\n  syntax: "<number>";\n  initial-value: 1;\n  inherits: true;\n}`),
    ...lengths.map((name) => `@property --${name}-${id} {\n  syntax: "<length>";\n  initial-value: 0px;\n  inherits: true;\n}`),
    `@property --rim-opacity-${id} {\n  syntax: "<number>";\n  initial-value: 0;\n  inherits: true;\n}`,
  ].join('\n\n');
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
 * The driver scales its periods, and the CSS animations scale through
 * `--rim-motion-scale`, so a learner who has asked for calm gets a slow breathe
 * instead of a strobe — not a missing surface.
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
  `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`;
const MASK_COMET = (id: string) => `radial-gradient(
      ellipse calc(78px * var(--rim-w-${id})) calc(60px * var(--rim-h-${id})) at calc(var(--rim-x-${id}) * 100%) 100%,
      white 0%, rgba(255,255,255,0.5) 45%, transparent 100%
    )`;

/** The ambient layer: a slow outward breathe on a glass surface at rest. */
function pulseOutsideCss({ id, palette, borderRadius, borderWidth, strength }: BeamCssOptions): string {
  const strokeOpacity = 0.94;
  const innerOpacity = 0.34;
  const bloomOpacity = 0.3;
  const brightness = 1.9;
  const saturation = 1.2;
  return `
${propertyRegs(id, true)}

[data-rim="${id}"] { position: relative; border-radius: ${borderRadius}px; overflow: visible; isolation: isolate; }
[data-rim="${id}"][data-active] { animation: rim-fade-in-${id} ${motionDur(0.6)} ease forwards; }
[data-rim="${id}"][data-fading] { animation: rim-fade-out-${id} ${motionDur(0.5)} ease forwards; }

[data-rim="${id}"][data-active]::after, [data-rim="${id}"][data-fading]::after {
  content: ""; position: absolute; inset: 0; border-radius: ${borderRadius}px; padding: 1px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${breatheRing(palette, id)};
  -webkit-mask: ${MASK_RING(id)};
  -webkit-mask-composite: xor;
  mask: ${MASK_RING(id)};
  mask-composite: exclude;
  pointer-events: none; z-index: 2; will-change: opacity, filter;
  opacity: calc(var(--rim-opacity-${id}) * ${strokeOpacity} * var(--rim-stroke-opacity, 1) * var(--rim-strength, ${strength}));
  filter: brightness(${brightness}) saturate(${saturation});
}

[data-rim="${id}"][data-active]::before, [data-rim="${id}"][data-fading]::before {
  content: ""; position: absolute; inset: -10px; z-index: -1; border-radius: ${borderRadius + 10}px;
  background: ${BREATHE_CORE.map((entry) => breatheStop(palette, id, entry)).join(',')};
  transform: scale(0.95, 0.9);
  pointer-events: none; will-change: opacity, filter;
  opacity: calc(var(--rim-opacity-${id}) * ${innerOpacity} * var(--rim-inner-opacity, 1) * var(--rim-strength, ${strength}));
  filter: blur(3px) brightness(${brightness}) saturate(${saturation});
}

[data-rim="${id}"] [data-rim-glow] {
  display: none; position: absolute; inset: -30px; z-index: -1; border-radius: ${borderRadius + 30}px;
  background: ${BREATHE_BLOOM.map((entry) => breatheStop(palette, id, entry, 0.77)).join(',')};
  transform: scale(0.95, 0.9);
  pointer-events: none; will-change: transform; opacity: 0;
}

[data-rim="${id}"][data-active] [data-rim-glow], [data-rim="${id}"][data-fading] [data-rim-glow] {
  display: block;
  opacity: calc(var(--rim-opacity-${id}) * ${bloomOpacity} * var(--rim-bloom-opacity, 1) * var(--rim-strength, ${strength}));
  filter: blur(22.5px) brightness(${brightness}) saturate(${saturation});
}

@keyframes rim-fade-in-${id} { to { --rim-opacity-${id}: 1; } }
@keyframes rim-fade-out-${id} { from { --rim-opacity-${id}: 1; } to { --rim-opacity-${id}: 0; } }
${frozenAnimRule(id)}
${reducedMotionRule(id)}
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
${propertyRegs(id, false)}

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
    radial-gradient(ellipse calc(24px * var(--rim-w-${id})) calc(28px * var(--rim-h-${id})) at calc(var(--rim-x-${id}) * 100%) calc(100% + 2px), rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.12) 30%, transparent 65%),
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
  box-shadow: inset 0 0 9px 1px rgba(255, 255, 255, 0.1);
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
    white 0%, rgba(255,255,255,0.5) 35%, transparent 100%
  );
  mask: radial-gradient(
    ellipse calc(84px * var(--rim-w-${id})) calc(110px * var(--rim-h-${id})) at calc(var(--rim-x-${id}) * 100%) 100%,
    white 0%, rgba(255,255,255,0.5) 35%, transparent 100%
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

/**
 * The shared pulse driver.
 *
 * One rAF loop for every beam on screen, capped at 30 fps: the ambient layer is a
 * slow breathe, so thirty updates a second is indistinguishable from sixty and
 * costs half the main-thread time. The loop stops itself when the last beam
 * detaches, which is what keeps a screen with no beams entirely idle.
 */
interface PulseEntry {
  el: HTMLElement;
  config: PulseDriverConfig;
}

const activeBeams = new Set<PulseEntry>();
let beamFrame: number | null = null;
let lastBeamTick = 0;
const MIN_TICK_GAP = 1000 / 30 - 2;
const TAU = Math.PI * 2;

function easeCycle(phase: number): number {
  return (1 - Math.cos(TAU * phase)) / 2;
}

function beamTick(timestamp: number): void {
  beamFrame = requestAnimationFrame(beamTick);
  if (timestamp - lastBeamTick < MIN_TICK_GAP) return;
  lastBeamTick = timestamp;
  const seconds = timestamp / 1000;
  activeBeams.forEach(({ el, config }) => {
    for (const oscillator of config.oscillators) {
      const phase = (seconds - oscillator.delay) / oscillator.period;
      const value = oscillator.a + (oscillator.b - oscillator.a) * easeCycle(phase);
      el.style.setProperty(oscillator.prop, oscillator.unit === 'px' ? `${value.toFixed(2)}px` : value.toFixed(4));
    }
  });
}

function ensureBeamLoop(): void {
  if (beamFrame === null) {
    lastBeamTick = 0;
    beamFrame = requestAnimationFrame(beamTick);
  }
}

function haltBeamLoopIfIdle(): void {
  if (activeBeams.size === 0 && beamFrame !== null) {
    cancelAnimationFrame(beamFrame);
    beamFrame = null;
  }
}

/** Attaches an element to the shared loop; the returned function detaches it. */
export function attachPulse(el: HTMLElement, config: PulseDriverConfig): () => void {
  const entry = { el, config };
  activeBeams.add(entry);
  ensureBeamLoop();
  return () => {
    activeBeams.delete(entry);
    haltBeamLoopIfIdle();
  };
}
