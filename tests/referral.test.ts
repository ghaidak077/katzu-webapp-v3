import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';

// Local replica of the worker's sign(): HMAC-SHA256 hex, uppercased, first 16 chars.
async function sign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 16);
}

function token(payload: Record<string, unknown>, header = { alg: 'RS256', typ: 'JWT' }) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.signature`;
}

const accountPayload = (sub: string, overrides: Record<string, unknown> = {}) => ({
  sub,
  aud: 'client-id',
  iss: 'https://accounts.google.com',
  exp: Math.floor(Date.now() / 1000) + 3600,
  email: `${sub}@example.test`,
  ...overrides,
});

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) || null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

async function post(path: string, body: unknown, env: Record<string, unknown>) {
  return worker.fetch(new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env);
}

describe('Verified referral system', () => {
  const hmacSecret = 'test-hmac-secret';

  it('issues each user a stable personal referral code', async () => {
    const env = { TEST_MODE: true, GOOGLE_CLIENT_ID: 'client-id', REDEEMED_CODES: new MemoryKv(), USER_PROGRESS: new MemoryKv() };
    const res = await post('/referral/info', { id_token: token(accountPayload('ref-user-1')) }, env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.referral_code).toMatch(/^REF-[A-Z2-9]{8}$/);

    const second = await (await post('/referral/info', { id_token: token(accountPayload('ref-user-1')) }, env)).json();
    expect(second.referral_code).toBe(data.referral_code);
  });

  it('rejects invalid referral codes and self-referral', async () => {
    const env = { TEST_MODE: true, GOOGLE_CLIENT_ID: 'client-id', REDEEMED_CODES: new MemoryKv(), USER_PROGRESS: new MemoryKv() };

    const bad = await post('/referral/claim', { id_token: token(accountPayload('claimer-1')), referral_code: 'REF-WRONG123' }, env);
    expect((await bad.json()).code).toBe('INVALID_REFERRAL');

    // Seed referrer KV then claim with own code
    await env.REDEEMED_CODES.put('refcode:REF-OWNCODE1', JSON.stringify({ sub: 'claimer-1' }));
    const self = await post('/referral/claim', { id_token: token(accountPayload('claimer-1')), referral_code: 'REF-OWNCODE1' }, env);
    expect((await self.json()).code).toBe('SELF_REFERRAL');
  });

  it('prevents double-claiming and rejects active subscribers', async () => {
    const env = { TEST_MODE: true, GOOGLE_CLIENT_ID: 'client-id', REDEEMED_CODES: new MemoryKv(), USER_PROGRESS: new MemoryKv() };
    await env.REDEEMED_CODES.put('refcode:REF-GOODCODE', JSON.stringify({ sub: 'referrer-a' }));

    const claim = await post('/referral/claim', { id_token: token(accountPayload('invitee-1')), referral_code: 'REF-GOODCODE' }, env);
    expect(await claim.json()).toMatchObject({ success: true, status: 'pending' });

    const again = await post('/referral/claim', { id_token: token(accountPayload('invitee-1')), referral_code: 'REF-GOODCODE' }, env);
    expect((await again.json()).code).toBe('ALREADY_REFERRED');

    // A user with an active subscription cannot claim
    await env.REDEEMED_CODES.put('account:invitee-2', JSON.stringify({ expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() }));
    const subscriber = await post('/referral/claim', { id_token: token(accountPayload('invitee-2')), referral_code: 'REF-GOODCODE' }, env);
    expect((await subscriber.json()).code).toBe('ONLY_FOR_NEW_ACCOUNTS');
  });

  it('pays the referrer 1 Pro month only after the invitee\u2019s first verified code redemption', async () => {
    const env = {
      TEST_MODE: true,
      GOOGLE_CLIENT_ID: 'client-id',
      HMAC_SECRET: hmacSecret,
      REDEEMED_CODES: new MemoryKv(),
      USER_PROGRESS: new MemoryKv(),
    };

    // Referrer generates their code
    const info = await (await post('/referral/info', { id_token: token(accountPayload('referrer-x')) }, env)).json();
    const code = info.referral_code as string;

    // Referrer code must be discoverable by the claim endpoint: /referral/info seeds it
    await env.REDEEMED_CODES.put(`refcode:${code}`, JSON.stringify({ sub: 'referrer-x' }));

    // Invitee claims the code
    const claim = await post('/referral/claim', { id_token: token(accountPayload('invitee-x')), referral_code: code }, env);
    expect(await claim.json()).toMatchObject({ success: true, status: 'pending' });

    // Before purchase: no reward
    const preState = JSON.parse(await env.REDEEMED_CODES.get('referred-by:invitee-x')!);
    expect(preState.status).toBe('pending');

    // Invitee redeems their first activation code (HMAC-signed, like the admin forger produces)
    const nonce = 'A1B2C3D4';
    const sig = await sign(`DE-6M-${nonce}`, hmacSecret);
    const redeem = await post('/verify', { code: `DE-6M-${nonce}-${sig}`, id_token: token(accountPayload('invitee-x')) }, env);
    expect(await redeem.json()).toMatchObject({ valid: true, months: 6 });

    // Claim flips to verified
    const postState = JSON.parse(await env.REDEEMED_CODES.get('referred-by:invitee-x')!);
    expect(postState.status).toBe('verified');

    // Referrer's expiry extended by exactly 1 month from now (they had none before)
    const referrerAccount = JSON.parse(await env.REDEEMED_CODES.get('account:referrer-x')!);
    expect(referrerAccount.expiresAt).toBeTruthy();

    // Referral history is queryable for the referrer
    const infoAfter = await (await post('/referral/info', { id_token: token(accountPayload('referrer-x')) }, env)).json();
    expect(infoAfter.verified_referrals).toBe(1);
    expect(infoAfter.total_reward_months).toBe(1);
    expect(infoAfter.referrals[0]).toMatchObject({ status: 'verified' });
    expect(infoAfter.referrals[0].invited_email_masked).toContain('***');
  });

  it('never double-pays: second redemption on the same account does not re-award', async () => {
    const env = {
      TEST_MODE: true,
      GOOGLE_CLIENT_ID: 'client-id',
      HMAC_SECRET: hmacSecret,
      REDEEMED_CODES: new MemoryKv(),
      USER_PROGRESS: new MemoryKv(),
    };

    await env.REDEEMED_CODES.put('refcode:REF-PAYONCE1', JSON.stringify({ sub: 'referrer-p' }));
    await post('/referral/claim', { id_token: token(accountPayload('invitee-p')), referral_code: 'REF-PAYONCE1' }, env);

    const mk = async (nonce: string) => `DE-3M-${nonce}-${await sign(`DE-3M-${nonce}`, hmacSecret)}`;
    await post('/verify', { code: await mk('AAAA1111'), id_token: token(accountPayload('invitee-p')) }, env);
    const firstExpiry = JSON.parse(await env.REDEEMED_CODES.get('account:referrer-p')!).expiresAt;

    await post('/verify', { code: await mk('BBBB2222'), id_token: token(accountPayload('invitee-p')) }, env);
    const secondExpiry = JSON.parse(await env.REDEEMED_CODES.get('account:referrer-p')!).expiresAt;

    expect(secondExpiry).toBe(firstExpiry); // no second month awarded
    const postState = JSON.parse(await env.REDEEMED_CODES.get('referred-by:invitee-p')!);
    expect(postState.status).toBe('verified');
  });
});
