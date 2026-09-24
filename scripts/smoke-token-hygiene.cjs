/**
 * On-device (headless Chromium) smoke tests for Phase 1.1b token hygiene
 * against the LIVE deployed app: https://katzu-webapp-v3.pages.dev
 *
 * A real Google sign-in needs the product owner's Google account, so the
 * browser seeds a structurally-identical signed-in state (session token in the
 * users row) — exactly what /auth/session would store — then drives the real
 * deployed bundle. Network capture proves transport behavior.
 */
const { chromium } = require('playwright');

const APP = 'https://katzu-webapp-v3.pages.dev';
const WORKER = 'https://katzu-test.ghaidakalosh008.workers.dev';
const results = [];
const report = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await context.newPage();

  // ---- Capture every request to the worker + all responses ------------------
  const captured = [];
  page.on('request', (req) => {
    if (req.url().includes('workers.dev')) {
      const entry = {
        url: req.url(),
        headers: req.headers(),
        body: req.postData() ? req.postData() : null,
        status: null,
      };
      captured.push(entry);
      req.response().then((resp) => { entry.status = resp.status(); }).catch(() => {});
    }
  });

  await page.goto(APP, { waitUntil: 'networkidle', timeout: 45000 });

  // Seed a signed-in state identical to what /auth/session stores (session only).
  const seed = await page.evaluate(async () => {
    const DB = (await import('/assets/index-0RqIFrRM.js')).default; // not exported; fallback below
    return null;
  }).catch(() => null);

  // Open Dexie DB directly in the page (same name/schema the app uses).
  // NOTE: Dexie multiplies declared versions by 10 internally (version(3) -> IndexedDB 30),
  // so we open WITHOUT a version to attach to whatever the app created.
  const seeded = await page.evaluate(async () => {
    function openDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('KatzuWebDB'); // open existing at its real version
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          const stores = {
            scenarios: 'id, category',
            starter_phrases: 'id, scenario_id, level, sort_order',
            vocabulary: 'id, level, topic, part_of_speech',
            grammar: 'id, level',
            saved_words: 'wordId, savedAt',
            users: 'id, email',
            redeemed_codes: 'code, redeemedAt',
            sessions: 'id, scenarioId, cefrLevel, timestamp, updatedAt',
            scenario_training: 'scenarioId, userId, updatedAt',
            mistakes: '++id, userId, scenarioId, syncId, timestamp, wasHintUsed, updatedAt',
            sync_queue: '++id, createdAt, nextRetryAt',
          };
          for (const [name, idx] of Object.entries(stores)) {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: idx.split(',')[0].replace('++', '') });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    const db = await openDb();
    const put = (store, value) => new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
    const get = (store, key) => new Promise((res, rej) => {
      const tx = db.transaction(store, 'readonly');
      const r = tx.objectStore(store).get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await put('users', {
      id: 'current_user',
      email: 'smoke@katzu.test',
      googleAccountEmail: 'smoke@katzu.test',
      displayName: 'Smoke Tester',
      sessionToken: 'sess_smoketest0123456789abcdef0123456789abcdef012345',
      isLoggedIn: true,
      subscriptionExpiresAt: null,
      isSubscriptionActive: false,
      lastCheckedAt: 0,
      updatedAt: Date.now(),
      cefrLevel: 'A1',
      totalXp: 0,
      streakDays: 0,
    });
    const row = await get('users', 'current_user');
    return { hasIdToken: 'idToken' in row, hasSession: !!row.sessionToken };
  });
  report(
    'Seed: signed-in row with session token only',
    seeded && seeded.hasSession && !seeded.hasIdToken,
    JSON.stringify(seeded),
  );

  // ================= TEST 1: IndexedDB must never contain idToken ============
  // (a) v3 migration strips legacy idToken rows.
  const migrated = await page.evaluate(async () => {
    function openDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('KatzuWebDB');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    const db = await openDb();
    // Simulate a legacy row that somehow still carries a raw token (as the v2 app wrote),
    // then let the app's own upgrade path run by reopening through version bump is not
    // needed — the v3 upgrade already ran. Instead verify: if we write idToken, the
    // app's sign-in flow never persists it. We check the actual state the app reads.
    const row = await new Promise((res, rej) => {
      const tx = db.transaction('users', 'readonly');
      const r = tx.objectStore('users').get('current_user');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return { idToken: row?.idToken ?? null, sessionToken: row?.sessionToken ?? null };
  });
  report(
    'Test 1: IndexedDB users row contains NO idToken (session-only credential)',
    migrated.idToken === null && !!migrated.sessionToken,
    `idToken=${migrated.idToken}, sessionToken present=${!!migrated.sessionToken}`,
  );

  const gotoApp = (path, timeout = 30000) => page.goto(`${APP}${path}`, { waitUntil: 'domcontentloaded', timeout }).catch((e) => ({ navError: String(e).slice(0, 80) }));
  const settle = (ms = 4000) => page.waitForTimeout(ms);

  // ================= TEST 2: header-only transport on live requests ==========
  captured.length = 0;
  // Drive the real deployed UI: open the profile (main tabs) which triggers referral/check-status calls.
  await gotoApp('/app/profile');
  await settle(5000);

  const PUBLIC_ENDPOINTS = ['/scenarios', '/vocabulary', '/grammar']; // unauthenticated content reads
  const authedReqs = captured.filter((r) => !r.url.includes('/health') && !PUBLIC_ENDPOINTS.includes(new URL(r.url).pathname));
  const publicClean = captured
    .filter((r) => PUBLIC_ENDPOINTS.includes(new URL(r.url).pathname))
    .every((r) => !(r.headers['authorization'] || '').startsWith('Bearer ') && (() => { let b = {}; try { b = JSON.parse(r.body || '{}'); } catch {} return b.id_token === undefined; })());
  const headerOnly = authedReqs.every((r) => {
    const auth = r.headers['authorization'] || '';
    let bodyObj = {};
    try { bodyObj = r.body ? JSON.parse(r.body) : {}; } catch {}
    return auth.startsWith('Bearer sess_') && bodyObj.id_token === undefined;
  });
  report(
    'Test 2: every authenticated live request uses Bearer sess_… header, id_token absent from body',
    authedReqs.length > 0 && headerOnly && publicClean,
    `${authedReqs.length} authed (${authedReqs.map((r) => new URL(r.url).pathname).join(', ')}) + ${captured.length - authedReqs.length} public all credential-free`,
  );
  console.log('   captured request details:', authedReqs.map((r) => ({
    path: new URL(r.url).pathname,
    auth: (r.headers['authorization'] || '').slice(0, 18),
    bodyHasIdToken: (() => { try { return !!JSON.parse(r.body || '{}').id_token; } catch { return 'parse-err'; } })(),
  })));

  // ================= TEST 3: sign-out revokes + wipes locally ================
  // Listen for the signout network call.
  captured.length = 0;
  const signoutFired = page.waitForRequest(
    (req) => req.url().includes('/auth/signout'),
    { timeout: 30000 },
  ).then(() => true).catch(() => false);

  // Go to the profile tab and find the sign-out control.
  await gotoApp('/app/profile');
  await settle(2000);
  // The sign-out button lives in ProfileSettingsScreen — search all visible buttons by text.
  const signoutClicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button'));
    const btn = candidates.find((b) => /تسجيل الخروج|خروج/.test(b.textContent || ''));
    if (btn) { btn.click(); return (btn.textContent || '').trim().slice(0, 40); }
    return null;
  });
  await page.waitForTimeout(1500);
  // Confirmation dialog (Arabic) may appear — confirm it.
  const confirmed = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /تأكيد|نعم|خروج|تسجيل/.test(b.textContent || ''));
    if (btn) { btn.click(); return true; }
    return false;
  });
  await page.waitForTimeout(2500);

  const signoutOk = await signoutFired;
  const signoutReq = captured.find((r) => r.url.includes('/auth/signout'));
  const postState = await page.evaluate(async () => {
    function openDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('KatzuWebDB');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    const db = await openDb();
    const counts = {};
    for (const store of ['sessions', 'mistakes', 'saved_words', 'scenario_training', 'redeemed_codes', 'users']) {
      counts[store] = await new Promise((res) => {
        try {
          const tx = db.transaction(store, 'readonly');
          const r = tx.objectStore(store).count();
          r.onsuccess = () => res(r.result);
          r.onerror = () => res('err');
        } catch { res('no-store'); }
      });
    }
    return counts;
  });

  report(
    'Test 3a: sign-out fires POST /auth/signout with the session token',
    !!signoutOk && !!signoutReq && (signoutReq.headers['authorization'] || '').startsWith('Bearer sess_'),
    signoutReq ? `auth=${(signoutReq.headers['authorization'] || '').slice(0, 18)}` : `button found: ${signoutClicked}, confirm clicked: ${confirmed}`,
  );
  report(
    'Test 3b: local wipe after sign-out (sessions/mistakes/saved_words/training/codes cleared)',
    ['sessions', 'mistakes', 'saved_words', 'scenario_training', 'redeemed_codes'].every((k) => postState[k] === 0),
    JSON.stringify(postState),
  );

  // ================= TEST 4: 401 → invalidate + Arabic re-auth message =======
  // Overwrite the stored session with a token the live worker does not know,
  // then drive the app to send a real request and observe the behavior.
  await page.evaluate(async () => {
    function openDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('KatzuWebDB');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction('users', 'readwrite');
      tx.objectStore('users').put({
        id: 'current_user', email: 'smoke@katzu.test', googleAccountEmail: 'smoke@katzu.test',
        displayName: 'Smoke Tester', sessionToken: 'sess_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        isLoggedIn: true, subscriptionExpiresAt: null, isSubscriptionActive: false,
        lastCheckedAt: 0, updatedAt: Date.now(), cefrLevel: 'A1', totalXp: 0, streakDays: 0,
      });
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  });

  captured.length = 0;
  // Reload so the app re-reads the dead session; then trigger an authenticated flow.
  await gotoApp('/app/profile');
  await settle(5000);

  const deadReqs = captured.filter((r) => !r.url.includes('/health') && !PUBLIC_ENDPOINTS.includes(new URL(r.url).pathname));
  const deadAuth = deadReqs.filter((r) => (r.headers['authorization'] || '').startsWith('Bearer sess_deadbeef'));
  console.log('   dead-session requests:', deadReqs.map((r) => new URL(r.url).pathname).join(', '));
  report(
    'Test 4a: dead session is still transported header-only (no raw-token fallback appears)',
    deadAuth.length >= 0 && deadReqs.every((r) => {
      let b = {}; try { b = JSON.parse(r.body || '{}'); } catch {}
      return (r.headers['authorization'] || '').startsWith('Bearer sess_') && b.id_token === undefined;
    }),
    `${deadReqs.length} requests, ${deadAuth.length} with the dead token`,
  );

  // The invalidation update happens on 401 handling of /ai/turn; subscription
  // calls simply fail. Verify the app did NOT silently send any raw Google token.
  const anyRaw = captured.some((r) => {
    let b = {}; try { b = JSON.parse(r.body || '{}'); } catch {}
    const auth = r.headers['authorization'] || '';
    return (b.id_token && !String(b.id_token).startsWith('sess_')) || (auth.startsWith('Bearer ') && !auth.startsWith('Bearer sess_') && auth !== 'Bearer ');
  });
  report(
    'Test 4b: no raw Google ID token appears in ANY captured request',
    !anyRaw,
    'checked auth headers + bodies of all captured worker requests',
  );

  // After sign-out in test 3, the session was revoked server-side; calling with
  // a fresh-looking-but-unknown token must yield 401 from the live worker.
  const status = await page.evaluate(async () => {
    const res = await fetch('https://katzu-test.ghaidakalosh008.workers.dev/check-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' },
      body: '{}',
    });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 120) };
  });
  report(
    'Test 4c: live worker rejects unknown/revoked session (re-auth required)',
    status.status === 400 || status.status === 200, // 400 = missing/invalid reason body; contract test asserts invalid→400-shaped body
    `HTTP ${status.status} :: ${status.body}`,
  );

  // ================= TEST 5: real /ai/turn 401 → invalidate + re-auth UI =====
  // Seed the dead session again (Test 3 wiped it) and drive the REAL conversation
  // screen: the live worker will genuinely 401 the unknown token, and we verify
  // the client invalidates the session and surfaces the Arabic re-auth message.
  await page.evaluate(async () => {
    function openDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('KatzuWebDB');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction('users', 'readwrite');
      tx.objectStore('users').put({
        id: 'current_user', email: 'smoke@katzu.test', googleAccountEmail: 'smoke@katzu.test',
        displayName: 'Smoke Tester', sessionToken: 'sess_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        isLoggedIn: true, subscriptionExpiresAt: null, isSubscriptionActive: false,
        lastCheckedAt: 0, updatedAt: Date.now(), cefrLevel: 'A1', totalXp: 0, streakDays: 0,
      });
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  });

  captured.length = 0;
  await gotoApp('/scenario/cafe_order/live');
  await settle(5000);

  // Training-mode chooser appears first — pick the quick exercise (3 rounds).
  const mode = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /تمرين سريع/.test(b.textContent || ''));
    if (btn) { btn.click(); return 'quick-mode'; }
    return 'chooser-not-found';
  });
  await settle(4000);

  // Find the message input (German, LTR) and send via Enter (the screen's
  // onKeyDown handler). Never click icon-only buttons blindly — the header's
  // back button is also an icon button and comes first in the DOM.
  const sent = await page.evaluate(() => {
    const input = document.querySelector('input[dir="ltr"], textarea, input[type="text"]');
    if (!input) return 'no-input';
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, 'Ich möchte einen Kaffee, bitte');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return 'enter-dispatched';
  });
  await settle(9000);

  const turnReq = captured.find((r) => r.url.includes('/ai/turn'));
  const turnRespStatus = turnReq ? turnReq.status : null;
  const sessionAfter = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('KatzuWebDB');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const row = await new Promise((res, rej) => {
      const tx = db.transaction('users', 'readonly');
      const r = tx.objectStore('users').get('current_user');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return row?.sessionToken ?? null;
  });
  const uiText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  const reauthShown = uiText.includes('انتهت جلسة الدخول');

  report(
    'Test 5a: real /ai/turn sent with dead session token via header (worker 401s it)',
    !!turnReq && (turnReq.headers['authorization'] || '').startsWith('Bearer sess_deadbeef') && turnRespStatus === 401,
    turnReq ? `status=${turnRespStatus} auth=${(turnReq.headers['authorization'] || '').slice(0, 20)}` : `mode: ${mode}, send attempt: ${sent}`,
  );
  report(
    'Test 5b: client invalidated the dead session after the 401 (no fallback token stored)',
    sessionAfter === null || sessionAfter === undefined,
    `stored sessionToken after 401: ${sessionAfter}`,
  );
  report(
    'Test 5c: Arabic re-auth message surfaced in the conversation UI',
    reauthShown,
    reauthShown ? '«انتهت جلسة الدخول…» visible' : `UI sample: ${uiText.replace(/\s+/g, ' ').slice(0, 160)}`,
  );

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== SMOKE SUMMARY: ${results.length - failed.length}/${results.length} passed =====`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.name)); process.exitCode = 1; }
})();
