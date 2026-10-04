import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { pwaOptions } from '../vite.config';

/**
 * The install icon, as pixels.
 *
 * The bug the owner reported — the Katzu logo drawn "white and broken" once the
 * PWA is installed on a phone — is invisible from every angle a developer
 * normally checks. The manifest parsed, the file loaded, the URL resolved. What
 * was actually wrong lived in the pixels and the metadata: the art shipped with
 * a transparent background (only ~35% of the image was opaque, corners fully
 * clear) and the manifest declared a size the file did not have (a 512 px image
 * labelled 192x192). A launcher handed transparency and/or a mismatched size
 * paints its own placeholder — the white square.
 *
 * So this test does not trust the manifest to describe the file. It decodes the
 * PNG and checks the two facts a launcher needs: the real dimensions equal the
 * declared `sizes`, and no pixel is see-through. A regression that reverts the
 * icons to the raw transparent mascot art fails here, on a developer machine,
 * before it can ever reach a phone.
 */

interface Png {
  width: number;
  height: number;
  /** RGBA bytes, four per pixel, after scanline unfiltering. */
  pixels: Buffer;
}

function decodePng(url: URL): Png {
  const buffer = readFileSync(url);
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a PNG: ${url.pathname}`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const interlace = buffer[28];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}): ${url.pathname}`);
  }

  // Concatenate every IDAT chunk, then inflate to the raw scanline stream.
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = pixels.subarray(y * stride, y * stride + stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, (y - 1) * stride + stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? out[x - 4] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= 4 ? prev[x - 4] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = value & 0xff;
    }
  }
  return { width, height, pixels };
}

function minAlpha(png: Png): number {
  let min = 255;
  for (let index = 3; index < png.pixels.length; index += 4) {
    if (png.pixels[index] < min) min = png.pixels[index];
  }
  return min;
}

const PUBLIC = new URL('../public/', import.meta.url);

describe('install icons are opaque and self-consistent', () => {
  const icons = pwaOptions.manifest.icons ?? [];

  it('declares both a maskable icon and a plain `any` icon', () => {
    const purposes = icons.map((icon) => icon.purpose);
    expect(purposes).toContain('maskable');
    expect(purposes).toContain('any');
  });

  it.each(icons.map((icon) => [icon.src, icon.sizes] as const))(
    '%s is %s of real, fully opaque pixels',
    (src, sizes) => {
      const png = decodePng(new URL(src, PUBLIC));
      const [width, height] = sizes.split('x').map(Number);
      expect(png.width).toBe(width);
      expect(png.height).toBe(height);
      // 255 everywhere: no transparency a launcher could fill with white.
      expect(minAlpha(png)).toBe(255);
    },
  );

  it('ships an opaque 180x180 apple-touch-icon for iOS', () => {
    const png = decodePng(new URL('assets/mascot/katzu_apple_180.png', PUBLIC));
    expect(png.width).toBe(180);
    expect(png.height).toBe(180);
    expect(minAlpha(png)).toBe(255);
  });
});
