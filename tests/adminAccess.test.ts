import { beforeEach, describe, expect, it } from 'vitest';
import {
  accessConfigured,
  accessTokenFrom,
  decodeSegment,
  resetAccessCerts,
  verifyAccessJwt,
} from '../admin-worker/src/access';

/**
 * The panel's outer lock is a signed Access assertion. These tests generate a
 * real RSA key locally, sign real JWTs and prove every rejection path — the
 * certificate fetcher is injected, so no production bypass exists.
 */

const TEAM = 'katzu-test.cloudflareaccess.com';
const AUD = 'aud-' + 'a'.repeat(32);
const ISS = `https://${TEAM}`;
const KID = 'test-key-1';

function b64url(bytes: Uint8Array | string): string {
  const buffer = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let binary = '';
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

async function makeKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
}

async function token(overrides: Record<string, unknown> = {}, headerOverrides: Record<string, unknown> = {}) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID, ...headerOverrides }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iss: ISS, aud: AUD, exp: now + 300, iat: now - 5, ...overrides }));
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(new Uint8Array(signature))}`;
}

function certsReturning(keys: JsonWebKey[]) {
  return async () => keys;
}

beforeEach(async () => {
  resetAccessCerts();
  if (!privateKey) await makeKeys();
});

describe('configuration is fail-closed', () => {
  it('is configured only when both the team domain and audience are set', () => {
    expect(accessConfigured({})).toBe(false);
    expect(accessConfigured({ ACCESS_TEAM_DOMAIN: TEAM })).toBe(false);
    expect(accessConfigured({ ACCESS_AUD: AUD })).toBe(false);
    expect(accessConfigured({ ACCESS_TEAM_DOMAIN: '  ', ACCESS_AUD: AUD })).toBe(false);
    expect(accessConfigured({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD })).toBe(true);
  });
});

describe('verifyAccessJwt', () => {
  it('accepts a correctly signed, current token', async () => {
    const jwt = await token();
    const result = await verifyAccessJwt(jwt, {
      teamDomain: TEAM,
      aud: AUD,
      fetchCerts: certsReturning([{ ...publicJwk, kid: KID }]),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.aud).toBe(AUD);
  });

  it('accepts an audience array that contains ours', async () => {
    const jwt = await token({ aud: ['other', AUD] });
    const result = await verifyAccessJwt(jwt, {
      teamDomain: TEAM,
      aud: AUD,
      fetchCerts: certsReturning([{ ...publicJwk, kid: KID }]),
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = await token({ exp: now - 1 });
    const result = await verifyAccessJwt(jwt, {
      teamDomain: TEAM,
      aud: AUD,
      fetchCerts: certsReturning([{ ...publicJwk, kid: KID }]),
    });
    expect(result).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('rejects the wrong audience and the wrong issuer', async () => {
    const wrongAud = await token({ aud: 'someone-else' });
    const wrongIss = await token({ iss: 'https://evil.example.com' });
    const options = { teamDomain: TEAM, aud: AUD, fetchCerts: certsReturning([{ ...publicJwk, kid: KID }]) };
    expect(await verifyAccessJwt(wrongAud, options)).toMatchObject({ ok: false, reason: 'wrong_audience' });
    expect(await verifyAccessJwt(wrongIss, options)).toMatchObject({ ok: false, reason: 'wrong_issuer' });
  });

  it('rejects a tampered payload and a signature from another key', async () => {
    const jwt = await token();
    const [header, , signature] = jwt.split('.');
    const forged = `${header}.${b64url(JSON.stringify({ iss: ISS, aud: AUD, exp: 9999999999 }))}.${signature}`;
    const options = { teamDomain: TEAM, aud: AUD, fetchCerts: certsReturning([{ ...publicJwk, kid: KID }]) };
    expect(await verifyAccessJwt(forged, options)).toMatchObject({ ok: false, reason: 'bad_signature' });

    const other = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const otherJwk = await crypto.subtle.exportKey('jwk', other.publicKey);
    expect(await verifyAccessJwt(jwt, { ...options, fetchCerts: certsReturning([{ ...otherJwk, kid: KID }]) }))
      .toMatchObject({ ok: false, reason: 'bad_signature' });
  });

  it('rejects an unknown key id and a non-RS256 algorithm', async () => {
    const jwt = await token();
    const options = { teamDomain: TEAM, aud: AUD, fetchCerts: certsReturning([{ ...publicJwk, kid: 'another' }]) };
    expect(await verifyAccessJwt(jwt, options)).toMatchObject({ ok: false, reason: 'unknown_key' });

    const unsigned = `${b64url(JSON.stringify({ alg: 'none', kid: KID }))}.${jwt.split('.')[1]}.`;
    expect(await verifyAccessJwt(unsigned, options)).toMatchObject({ ok: false, reason: 'unsupported_alg' });
  });

  it('rejects malformed input without throwing', async () => {
    const options = { teamDomain: TEAM, aud: AUD, fetchCerts: certsReturning([{ ...publicJwk, kid: KID }]) };
    for (const value of ['', 'a.b', 'a.b.c', 'x'.repeat(9000), '...']) {
      await expect(verifyAccessJwt(value, options)).resolves.toMatchObject({ ok: false });
    }
    await expect(verifyAccessJwt(await token(), { teamDomain: '', aud: '' }))
      .resolves.toMatchObject({ ok: false, reason: 'not_configured' });
  });

  it('fails closed when the certificate endpoint is unavailable', async () => {
    const jwt = await token();
    const result = await verifyAccessJwt(jwt, {
      teamDomain: TEAM,
      aud: AUD,
      fetchCerts: async () => { throw new Error('down'); },
    });
    expect(result).toMatchObject({ ok: false, reason: 'certs_unavailable' });
  });

  it('does not accept a token whose kid matches but whose modulus is empty', async () => {
    const jwt = await token();
    const result = await verifyAccessJwt(jwt, {
      teamDomain: TEAM,
      aud: AUD,
      fetchCerts: certsReturning([{ kty: 'RSA', kid: KID, n: '', e: 'AQAB' } as JsonWebKey]),
    });
    expect(result).toMatchObject({ ok: false, reason: 'unknown_key' });
  });
});

describe('token extraction', () => {
  it('reads the assertion header first, then the Access cookie', () => {
    const withHeader = new Request('https://panel.test/', { headers: { 'cf-access-jwt-assertion': 'header-token' } });
    expect(accessTokenFrom(withHeader)).toBe('header-token');

    const cookieOnly = new Request('https://panel.test/', { headers: { cookie: 'a=1; CF_Authorization=cookie-token; b=2' } });
    expect(accessTokenFrom(cookieOnly)).toBe('cookie-token');

    expect(accessTokenFrom(new Request('https://panel.test/'))).toBe('');
  });

  it('decodes base64url segments including padding-free input', () => {
    expect(new TextDecoder().decode(decodeSegment(b64url('hello')))).toBe('hello');
  });
});
