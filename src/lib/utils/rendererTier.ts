/**
 * Is this WebGL context drawn by software?
 *
 * The decorative effects (the thinking indicator's shader, the orb's sphere) are
 * compiled by the graphics driver the first time they run, and that compile is
 * **synchronous on the renderer's main thread**. On a real GPU it is a few
 * milliseconds, which is why this check does not exist for their sake. On a software
 * rasteriser it is not: measured on SwiftShader, a single `compileShader` for the
 * thinking indicator's `fluid-dots` shader took **6,993 ms**, and the surrounding
 * program setup pushed one screen transition past **37 s** of frozen UI — inside the
 * episode, on the screen that opens every mission, for an animation whose whole job
 * is to say "working".
 *
 * A low-end Android phone, a browser whose GPU is blocklisted, a remote desktop or a
 * CI container all land here, and none of them should pay seconds of frozen screen
 * for decoration. The app already has a cheap, honest fallback for every effect that
 * consults this (a CSS dot for the indicator, the 2D canvas body for the orb), so the
 * rule is: **ask once, then draw the cheap version**.
 */

/** Renderer strings software rasterisers actually report, across engines. */
const SOFTWARE_PATTERN =
  /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen|virtualbox|virgl|swangle/i;

/** The subset of a context this needs, so tests can pass a plain object. */
export interface RendererProbe {
  getExtension(name: string): { UNMASKED_RENDERER_WEBGL: number } | null;
  getParameter(parameter: number): unknown;
  RENDERER: number;
}

/**
 * True when the driver is a software rasteriser.
 *
 * Falls back to the masked `RENDERER` string where `WEBGL_debug_renderer_info` is
 * unavailable, and answers **false** when it cannot tell: guessing "software" would
 * take the effect away from the hardware devices that are the overwhelming majority.
 */
export function isSoftwareRenderer(gl: RendererProbe): boolean {
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const unmasked = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '';
  const masked = gl.getParameter(gl.RENDERER);
  const name = `${typeof unmasked === 'string' ? unmasked : ''} ${typeof masked === 'string' ? masked : ''}`;
  return SOFTWARE_PATTERN.test(name);
}
