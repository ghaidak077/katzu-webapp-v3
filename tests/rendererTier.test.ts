import { describe, it, expect } from 'vitest';
import { isSoftwareRenderer, type RendererProbe } from '../src/lib/utils/rendererTier';

/**
 * The detector decides whether a decorative shader is compiled at all, so both
 * directions matter: a miss costs the learner seconds of frozen screen (measured at
 * 6,993 ms for one `compileShader` on SwiftShader), and a false positive takes the
 * effect away from hardware that renders it in milliseconds.
 */
function probe({
  unmasked,
  masked = 'WebKit WebGL',
  debugAvailable = true,
}: {
  unmasked?: string;
  masked?: string;
  debugAvailable?: boolean;
}): RendererProbe {
  return {
    RENDERER: 0x1f01,
    getExtension: (name) =>
      debugAvailable && name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null,
    getParameter: (parameter) => (parameter === 0x9246 ? unmasked : masked),
  };
}

describe('WebGL renderer tier', () => {
  it('recognises the software rasteriser that was measured in this project', () => {
    expect(
      isSoftwareRenderer(
        probe({
          unmasked:
            'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
        }),
      ),
    ).toBe(true);
  });

  it('recognises other software rasterisers by name', () => {
    for (const name of [
      'Mesa/X.org, llvmpipe (LLVM 15.0.6, 256 bits)',
      'Mesa OffScreen',
      'Microsoft Basic Render Driver',
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)',
      'virgl',
    ]) {
      expect(isSoftwareRenderer(probe({ unmasked: name })), name).toBe(true);
    }
  });

  it('leaves real hardware on the fast path', () => {
    for (const name of [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)',
      'Mali-G57 MC2',
      'Adreno (TM) 618',
      'PowerVR Rogue GE8320',
    ]) {
      expect(isSoftwareRenderer(probe({ unmasked: name })), name).toBe(false);
    }
  });

  it('uses the masked renderer when the debug extension is unavailable', () => {
    expect(isSoftwareRenderer(probe({ masked: 'llvmpipe', debugAvailable: false }))).toBe(true);
    expect(isSoftwareRenderer(probe({ masked: 'WebKit WebGL', debugAvailable: false }))).toBe(false);
  });

  it('answers "not software" when it cannot tell, rather than taking the effect away', () => {
    // A driver that reports nothing useful: the browser default, Safari's masked
    // renderer, and a context whose parameters are not strings.
    expect(isSoftwareRenderer(probe({ unmasked: undefined }))).toBe(false);
    expect(isSoftwareRenderer(probe({ unmasked: 'WebKit WebGL' }))).toBe(false);
    const odd = probe({});
    odd.getParameter = () => null;
    expect(isSoftwareRenderer(odd)).toBe(false);
  });
});
