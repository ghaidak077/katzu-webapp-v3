import { describe, it, expect } from 'vitest';

// Mimic worker code validation logic
function parseCode(code: string) {
  const match = code.trim().match(/^DE-(\d{1,2})M-([A-Z0-9]+)-([A-F0-9]+)$/i);
  if (!match) return null;
  const months = parseInt(match[1], 10);
  if (months < 1 || months > 12) return null;
  return { months, nonce: match[2], signature: match[3].toUpperCase() };
}

async function sign(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sigBuffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .slice(0, 16);
}

function addMonthsIso(existingIso: string | null, months: number) {
  const now = new Date();
  let base = now;
  if (existingIso) {
    const existing = new Date(existingIso);
    if (!isNaN(existing.getTime()) && existing.getTime() > now.getTime()) base = existing;
  }
  const result = new Date(base);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString();
}

describe('Subscription & Paid Codes Logic', () => {
  const mockSecret = 'KATZU_SUPER_SECRET_HMAC_KEY';

  it('correctly parses valid promotional and paid codes', () => {
    const code = 'DE-6M-A1B2C3D4-567890ABCDEF1234';
    const parsed = parseCode(code);
    expect(parsed).not.toBeNull();
    expect(parsed?.months).toBe(6);
    expect(parsed?.nonce).toBe('A1B2C3D4');
    expect(parsed?.signature).toBe('567890ABCDEF1234');
  });

  it('rejects malformed codes with wrong prefixes or invalid months', () => {
    expect(parseCode('EN-6M-A1B2C3D4-567890ABCDEF1234')).toBeNull();
    expect(parseCode('DE-0M-A1B2C3D4-567890ABCDEF1234')).toBeNull();
    expect(parseCode('DE-13M-A1B2C3D4-567890ABCDEF1234')).toBeNull();
    expect(parseCode('random_string')).toBeNull();
  });

  it('generates and verifies HMAC signatures match worker specification', async () => {
    const months = 3;
    const nonce = 'TESTNONCE';
    const unsigned = `DE-${months}M-${nonce}`;
    const signature = await sign(unsigned, mockSecret);

    expect(signature).toHaveLength(16);

    const fullCode = `${unsigned}-${signature}`;
    const parsed = parseCode(fullCode);
    expect(parsed).not.toBeNull();

    const expectedSig = await sign(`DE-${parsed!.months}M-${parsed!.nonce}`, mockSecret);
    expect(expectedSig).toBe(parsed!.signature);
  });

  it('accurately calculates subscription expiration adding months', () => {
    const now = new Date();
    const expiryIso = addMonthsIso(null, 1);
    const expiryDate = new Date(expiryIso);

    // Expiry should be roughly 28-31 days in the future
    const diffDays = Math.round((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(28);
    expect(diffDays).toBeLessThanOrEqual(32);
  });

  it('extends already active subscription from current expiration instead of now', () => {
    const futureDate = new Date(Date.now() + 60 * 86400000); // 60 days in future
    const extendedIso = addMonthsIso(futureDate.toISOString(), 2);
    const extendedDate = new Date(extendedIso);

    const diffDays = Math.round((extendedDate.getTime() - futureDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(58);
    expect(diffDays).toBeLessThanOrEqual(63);
  });
});
