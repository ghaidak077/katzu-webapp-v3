import React, { useEffect, useRef, useState } from 'react';
import { isSoftwareRenderer } from '@/lib/utils/rendererTier';
import { useReducedMotion } from '@/components/glass/GlassSurface';

/**
 * The app's one thinking/loading motion language.
 *
 * Two variants, two fixed meanings — never mixed arbitrarily:
 *
 *   fluid-dots → contemplative processing. The orb's `evaluating` state, a
 *                rehearsal deck being built, a scene being set up, a Debrief
 *                compiling its result, any content load.
 *   wave       → Katzu's voice is playing. Used where there is no orb on screen
 *                (Story Setup reading the German opener aloud), so the app never
 *                runs two live WebGL contexts to say the same thing.
 *
 * Differences from the source component, each deliberate:
 *  - **Transparent.** The demo painted `vec4(col, 1.0)` over an opaque canvas,
 *    which is a black box on an AMOLED surface. Output is premultiplied alpha
 *    keyed off luminance, so the motion sits *inside* glass instead of on top of it.
 *  - **Reduced motion draws one still frame** and never starts a loop. The
 *    indicator is progress information, not decoration, so it still appears.
 *  - **Never a dead end.** A missing context, a context the browser has already
 *    lost, or a shader that will not compile all fall back to a CSS dot, so a
 *    thinking state is never an empty square.
 *
 *  - **The context is never force-lost.** `WEBGL_lose_context.loseContext()` on
 *    unmount was measured at 9,303 ms of synchronous main-thread work on a software
 *    rasteriser (48.6 s with the CPU contended) — a frozen screen on the way into
 *    the episode — and because the canvas hands the *same lost context* back to the
 *    next mount, the indicator then failed to compile and vanished for good.
 *    `cleanup()` frees the program, shaders and buffer, which is what holds GPU
 *    memory; the context itself goes when the canvas does.
 *
 *  - **No shader is compiled on a software rasteriser.** These shaders are heavy
 *    per-pixel loops, and compiling them blocks the renderer thread: measured at
 *    6,993 ms for one `compileShader` and past 37 s for the whole setup on
 *    SwiftShader. Such a device gets the CSS dot immediately — see `rendererTier`.
 */

export type SiriWaveVariant = 'wave' | 'fluid-dots';

const VERTEX_SHADER = `attribute vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); }`;

const WAVE_SHADER = `precision highp float;
uniform vec2 iResolution; uniform float iTime;
const float PI = 3.14159265359;
const float AMPLITUDE   = 0.32;
const float FREQ        = 1.1;
const float ABER_FREQ   = 1.0;
const float SPEED       = 2.4;
const float WAVE_SCALE  = 0.6;
const float ABERRATION  = 2.6;
const float THICKNESS   = 3.0;
const float INTENSITY   = 2.;
const float FALLOFF     = 1.7;
const float EDGE_MASK   = 0.4;
const float EDGE_INSET  = 0.0;
const float BAND_FILL   = 30000.0;
const float BAND_THICK  = 0.08;
const float SOFTNESS    = 2.5;
const float LOW_AMP     = 6.0;
const float LOW_INT     = 1.5;
const float MID_ABER    = 0.8;
const float MID_ABAMP   = 0.05;
const float MID_BAND    = 20.0;
const float MID_SOFT    = 0.4;
const float HIGH_ABER   = 0.5;
const float HIGH_ABAMP  = 0.06;
const float RESOLVED    = 1.0;
const float UNRES_SCALE = 0.14;

vec3 spectral4(int s){
    float x = float(s);
    return clamp(vec3(abs(x-3.0)-1.0, 2.0-abs(x-2.0), 2.0-abs(x-4.0)), 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 R = iResolution.xy;
    float aspect = R.x / R.y;
    vec2 p = (fragCoord + 0.5) * 2.0 / R - 1.0;
    p.x *= aspect;
    float yScreen = p.y;
    p /= max(WAVE_SCALE, 0.1);
    float t   = iTime;
    float low  = clamp(0.45 + 0.45*sin(t*0.8)*sin(t*0.37+1.0), 0.0, 1.0);
    float mid  = clamp(0.40 + 0.40*sin(t*1.7+2.0)*sin(t*0.53), 0.0, 1.0);
    float high = clamp(0.30 + 0.30*sin(t*2.9+4.0)*sin(t*0.71+2.0), 0.0, 1.0);
    float res   = clamp(RESOLVED, 0.0, 1.0);
    float drift = mod(t, 20.0*PI) * SPEED;
    float xN  = p.x / max(aspect, 1.0);
    float env = cos(PI*0.5 * min(abs(0.9*xN), 1.0));
    env *= env;
    float A1    = AMPLITUDE + 0.01*low*LOW_AMP;
    float A2    = A1 + mid*MID_ABAMP + high*HIGH_ABAMP;
    float AB    = (ABERRATION + mid*MID_ABER + high*HIGH_ABER)*res;
    float th    = mix(0.1, 0.01*THICKNESS, res);
    float inten = mix(0.1, 0.01*(INTENSITY + low*LOW_INT), res);
    float soft  = 0.01*res*max(0.0, SOFTNESS + mid*MID_SOFT);
    float dUnres = max(length(p) - mix(0.14, UNRES_SCALE, res), 0.0);
    float yMain = A1 * env * res * sin(p.x*FREQ + drift);
    float bandFillTh = max(BAND_THICK, 1e-4);
    float bandAmt    = 1e-4 * BAND_FILL * inten;
    vec3 num = vec3(0.0), den = vec3(0.0);
    for(int s = 0; s < 4; s++){
        vec3 hue = mix(vec3(1.0), spectral4(s), res);
        den += hue;
        float ab = mix(-AB, AB, float(s)/3.0);
        float yL = A2 * env * res * sin(p.x*ABER_FREQ + drift + ab);
        float d   = mix(dUnres, abs(p.y - yL), res);
        float lor = mix(1.0/(1.0 + (0.02*d)*(0.02*d)), 1.0, res);
        float line = inten / (sqrt(d*d + soft*soft) + th);
        float lo = min(yMain, yL), hi = max(yMain, yL);
        float dBand = max(0.0, max(p.y - hi, lo - p.y));
        float band  = bandAmt / (dBand + bandFillTh);
        num += hue * lor * (line + band);
    }
    vec3 col = num / den;
    float dM    = mix(dUnres, abs(p.y - yMain), res);
    float lorM  = mix(1.0/(1.0 + (0.02*dM)*(0.02*dM)), 1.0, res);
    float boost = (1.0 - res) * (14.0*low + 4.0);
    col += 0.5 * inten * (lorM + boost) / (sqrt(dM*dM + soft*soft) + th);
    col = pow(max(col, 0.0), vec3(1.5));
    float emT = clamp((abs(yScreen) - 1.0 + EDGE_INSET) / (-max(EDGE_MASK, 1e-4)), 0.0, 1.0);
    float em  = emT*emT*(3.0 - 2.0*emT);
    float gauss = exp(-pow(xN*FALLOFF, 2.0));
    col *= mix(1.0, em*gauss, res);
    col *= res;
    float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
    fragColor = vec4(col * a, a);
}
void main(){ mainImage(gl_FragColor, gl_FragCoord.xy); }`;

const FLUID_DOTS_SHADER = `precision highp float;
uniform vec2 iResolution; uniform float iTime;
const float TAU = 6.28318530718;
const int   N   = 6;
const float SMOOTH_K = 0.08;
const float INTENSITY  = 0.0025;
const float FALLOFF_P  = 1.35;
const float FADE_START = 0.02;
const float FADE_END   = 0.56;
const float ABERR = 0.005;
const vec3  SPECTRAL = vec3(0.0, 0.5, 1.0) * ABERR;
const float HUE_SPEED = 0.06;
const float COLOR_K   = 0.5;
const float SAT       = 0.01;
const float HUE_SPAN  = 0.667;
const float MERGE_PERIOD = 6.0;
const float T_MOVE   = 1.25;
const float STAGGER  = 0.33;
const float HOLD     = 0.0;
const float W = 4.6;
const float L = 3.2;
const float PIERCE  = 0.12;
const float RECOIL  = 0.035;
const float REC_LAG = 0.11;
const float GATHER_PERIOD = 12.0;
const float GATHER_START  = 9.2;
const float GATHER_HOLD   = 0.8;
const float GATHER_R      = 0.008;
const float GATHER_DIM    = 0.85;
const float GATHER_IN     = 1.8;
const float GATHER_IN_L   = 7.5;
const float BURST_W = 6.5;
const float BURST_L = 4.0;
const float CHARGE_T     = 0.30;
const float CHARGE_SHRK  = 0.18;
const float CHARGE_GLOW  = 0.35;
const float FLASH_GAIN   = 1.2;
const float FLASH_DECAY  = 7.0;

float hash11(float n){ return fract(sin(n*127.1 + 311.7)*43758.5453); }
float settleWL(float tau, float w, float l){
    if(tau <= 0.0) return 0.0;
    return 1.0 - exp(-l*tau)*cos(w*tau);
}
float settle(float tau){ return settleWL(tau, W, L); }
float settleCrit(float tau, float l){
    if(tau <= 0.0) return 0.0;
    return 1.0 - exp(-l*tau)*(1.0 + l*tau);
}
float smin(float a, float b, float k){
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h*h*k*0.25;
}
vec3 hue2rgb(float h){
    h = fract(h);
    float r = clamp(abs(h*6.0 - 3.0) - 1.0, 0.0, 1.0);
    float g = clamp(2.0 - abs(h*6.0 - 2.0), 0.0, 1.0);
    float b = clamp(2.0 - abs(h*6.0 - 4.0), 0.0, 1.0);
    return vec3(r, g, b);
}
float dotR(float fi, float seed, float t){
    return 0.036 + 0.010*sin(t*1.3 + seed*TAU) + 0.005*sin(t*2.4 + fi*1.3);
}
float dotSD(vec2 p, vec2 pos, float r, float t, float fi, float shapeDamp){
    vec2 d = p - pos;
    float sq = 0.075 * (0.5 + 0.5*sin(t*0.9 + fi*2.0)) * shapeDamp;
    float ca = cos(t*0.35 + fi), sa = sin(t*0.35 + fi);
    d = mat2(ca,-sa,sa,ca) * d;
    d *= vec2(1.0+sq, 1.0-sq);
    return length(d) - r;
}
vec3 scene(vec2 p, float t){
    float k  = floor(t/MERGE_PERIOD);
    float u  = fract(t/MERGE_PERIOD);
    float te = u * MERGE_PERIOD;
    float tg = mod(t, GATHER_PERIOD);
    float g  = settleCrit((tg - GATHER_START) * GATHER_IN, GATHER_IN_L)
             - settleWL(tg - GATHER_START - GATHER_HOLD, BURST_W, BURST_L);
    float gC = clamp(g, 0.0, 1.0);
    float tb     = tg - (GATHER_START + GATHER_HOLD);
    float charge = smoothstep(-CHARGE_T, 0.0, min(tb, 0.0)) * gC;
    float flash  = tb > 0.0 ? exp(-tb * FLASH_DECAY) : 0.0;
    float gBright = mix(1.0, GATHER_DIM, gC) * (1.0 + CHARGE_GLOW*charge + FLASH_GAIN*flash);
    vec3  total3 = vec3(1e5);
    vec3  cAcc   = vec3(0.0);
    float wAcc   = 1e-6;
    for(int i=0; i<N; i++){
        float fi   = float(i);
        float seed = hash11(fi);
        float ang = fi/float(N)*TAU + t*0.35;
        vec2 dir  = vec2(cos(ang), sin(ang));
        float R = 0.17 + 0.010*sin(t*1.0) + 0.007*sin(t*1.3 + seed*TAU);
        float pairId   = mod(fi, 3.0);
        float moverLow = mod(k + pairId, 2.0);
        float isMover  = (fi < 2.5) ? step(moverLow, 0.5) : step(0.5, moverLow);
        float goStart  = pairId * STAGGER;
        float retStart = 3.0*STAGGER + HOLD + pairId * STAGGER;
        float m   = (settle(te - goStart)           - settle(te - retStart))           * isMover;
        float rec = (settle(te - goStart - REC_LAG) - settle(te - retStart - REC_LAG)) * (1.0 - isMover);
        float rSelf = dotR(fi, seed, t);
        rSelf = mix(rSelf, 0.036, gC);
        rSelf *= 1.0 - CHARGE_SHRK * charge;
        float fj    = mod(fi + 3.0, 6.0);
        float rPart = dotR(fj, hash11(fj), t);
        float deep   = -(R + RECOIL) - PIERCE * rPart;
        float radial = mix(R, deep, m) + RECOIL * rec;
        radial = mix(radial, GATHER_R, g);
        vec2  pos    = radial * dir;
        float sdR = dotSD(p - SPECTRAL.r*dir, pos, rSelf, t, fi, 1.0 - gC);
        float sdG = dotSD(p - SPECTRAL.g*dir, pos, rSelf, t, fi, 1.0 - gC);
        float sdB = dotSD(p - SPECTRAL.b*dir, pos, rSelf, t, fi, 1.0 - gC);
        total3 = vec3( smin(total3.r, sdR, SMOOTH_K),
                       smin(total3.g, sdG, SMOOTH_K),
                       smin(total3.b, sdB, SMOOTH_K) );
        float hue = fract(fi/float(N) + t*HUE_SPEED) * HUE_SPAN;
        vec3 dotCol = mix(vec3(1.0), hue2rgb(hue), SAT);
        float w = exp(-sdG * COLOR_K);
        cAcc += w * dotCol;
        wAcc += w;
    }
    vec3 sd3    = max(total3, vec3(0.0)) + 1e-4;
    vec3 core3  = clamp(INTENSITY / pow(sd3, vec3(FALLOFF_P)), 0.0, 1.0);
    vec3 edge3  = 1.0 - smoothstep(vec3(FADE_START), vec3(FADE_END), sd3);
    vec3 bright = core3 * edge3 * gBright;
    return bright * (cAcc / wAcc);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 res = iResolution.xy;
    vec2 p = (2.0*fragCoord - res) / min(res.x, res.y);
    float t = iTime;
    p /= 1.0 + 0.03*sin(t*1.0);
    vec3 col = scene(p, t);
    col *= 1.0 + 0.05*sin(t*1.0 + 1.0);
    col = pow(col, vec3(1.0/1.2));
    col = min(col, 1.0);
    float n = fract(sin(dot(fragCoord, vec2(12.9898,78.233)))*43758.5453);
    col += (n - 0.5)/255.0;
    col = max(col, vec3(0.0));
    float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
    fragColor = vec4(col * a, a);
}
void main(){ mainImage(gl_FragColor, gl_FragCoord.xy); }`;

const FRAGMENT_SHADERS: Record<SiriWaveVariant, string> = {
  wave: WAVE_SHADER,
  'fluid-dots': FLUID_DOTS_SHADER,
};

export interface SiriWaveProps extends Omit<React.HTMLAttributes<HTMLCanvasElement>, 'children'> {
  variant?: SiriWaveVariant;
  /** CSS pixel size of the square stage. */
  size?: number;
  /** Backing-store scale. 0.75 keeps a 48 px indicator cheap on a phone GPU. */
  renderScale?: number;
}

export const SiriWave: React.FC<SiriWaveProps> = ({
  variant = 'fluid-dots',
  size = 64,
  renderScale = 0.75,
  className,
  style,
  ...props
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // WebGL is the enhancement, never the indicator itself: when the engine cannot
  // give us a usable context the CSS pulse below says "working" instead.
  const [fallback, setFallback] = useState(false);
  // Read live, not once at setup: a learner who turns reduced motion on while a
  // long AI turn is still spinning used to keep the full-rate loop running, because
  // the old `matchMedia` read was captured when the effect mounted.
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setFallback(false);
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    // `isContextLost()` matters as much as the null check: a canvas that has been
    // lost (or was reported lost by the browser) still returns its old context
    // object, and every call on it silently does nothing — which is how a loader
    // turns into an empty box with no error anywhere.
    if (!gl || gl.isContextLost() || isSoftwareRenderer(gl)) {
      setFallback(true);
      return;
    }

    let program: WebGLProgram | null = null;
    let vertex: WebGLShader | null = null;
    let fragment: WebGLShader | null = null;
    let buffer: WebGLBuffer | null = null;
    let raf = 0;

    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (program) gl.deleteProgram(program);
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      if (buffer) gl.deleteBuffer(buffer);
      program = null;
      vertex = null;
      fragment = null;
      buffer = null;
    };

    try {
      const compile = (type: number, source: string): WebGLShader => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('shader allocation failed');
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const log = gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          throw new Error(log ?? 'shader compile error');
        }
        return shader;
      };

      program = gl.createProgram();
      if (!program) throw new Error('program allocation failed');
      vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADERS[variant]);
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? 'program link error');
      }
      gl.useProgram(program);

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const uResolution = gl.getUniformLocation(program, 'iResolution');
      const uTime = gl.getUniformLocation(program, 'iTime');

      const dim = Math.max(8, Math.round(size * renderScale));
      canvas.width = dim;
      canvas.height = dim;
      gl.viewport(0, 0, dim, dim);
      gl.clearColor(0, 0, 0, 0);
      // The shaders write opaque colour; compositing them premultiplied by their
      // own luminance is what makes the motion sit inside glass instead of
      // arriving as a black rectangle.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const started = performance.now();
      const draw = (seconds: number) => {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uResolution, dim, dim);
        gl.uniform1f(uTime, seconds);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };

      if (reduceMotion) {
        // One still frame: the indicator is information, so it is present, but it
        // does not move.
        draw(0.6);
      } else {
        const frame = () => {
          draw((performance.now() - started) / 1000);
          raf = requestAnimationFrame(frame);
        };
        frame();
      }
    } catch (error) {
      // A loader that cannot draw is a missing loader, never a broken screen.
      console.error('[SiriWave] shader setup failed', error);
      setFallback(true);
      cleanup();
      return;
    }

    return () => {
      // Deliberately no forced context loss here — see the header note: it costs
      // seconds of synchronous main-thread work, and the next mount inherits the
      // lost context.
      cleanup();
    };
  }, [variant, size, renderScale, reduceMotion]);

  const classes = ['kz-animated', fallback && 'kz-siri-fallback animate-kz-glow-pulse', className]
    .filter(Boolean)
    .join(' ');

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={classes}
      style={{ width: size, height: size, ...style }}
      {...props}
    />
  );
};

export default SiriWave;
