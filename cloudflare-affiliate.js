/**
 * Katzu affiliate programme — the ledger, the rules, and the operator surface.
 *
 * WHY THIS FILE EXISTS
 * cloudflare-unified-worker.js is ~175 KB and its edit tooling header already
 * documents that patches past a ~48 KB byte offset are unreliable. The affiliate
 * programme is self-contained (one config object, three tables, six rules), so it
 * lives here and the worker imports it — the same split as cloudflare-admin.js,
 * cloudflare-crypto.js and cloudflare-pricing.js.
 *
 * WHAT IT IS NOT
 * This is NOT the in-app referral reward (`REF-` codes in KV, one free month for
 * the inviter). That system is untouched and keeps its own tables. An affiliate
 * is an external partner with a public code; a referral is two learners.
 *
 * THE RULES, IN ONE PLACE
 * Every number and every status transition below is read from AFFILIATE_CONFIG.
 * The /affiliate page prints the same numbers from the same object, so a page
 * cannot promise a rate the ledger does not pay.
 *
 * MONEY IS INTEGER CENTS
 * `net_amount` is what the learner actually paid (the founding plan price for the
 * redeemed duration, from pricing.config.json). `amount` is the partner's share,
 * rounded once, at write time. No float arithmetic happens at payout.
 *
 * EXACTLY ONCE
 * `commissions.order_ref` is UNIQUE: one activation code pays one commission no
 * matter how many times /verify is retried or how many isolates race. A refund
 * after payout is a NEGATIVE commission row (`refund:<order_ref>`) so the next
 * payout batch nets it out without a fourth table. A partial unique index keeps
 * one original commission per referred account while still allowing those
 * negative rows.
 */

/* ------------------------------------------------------------------ */
/* The single source of truth                                          */
/* ------------------------------------------------------------------ */

export const AFFILIATE_CONFIG = {
  /** Share of the net amount actually received. */
  rate: 0.2,
  /** `pending` → `approved` this many days after the code was activated. */
  approvalDays: 14,
  /** Below this the balance is carried to the next payout, never sent early. */
  minPayoutCents: 2000,
  /** 1 = Monday. Payouts are prepared once a week on this weekday (UTC). */
  payoutWeekday: 1,
  /** The referral cookie lives this long on `.katzuai.com`. */
  cookieDays: 30,
  /** A partner code is 3–20 upper-case letters/digits. */
  codePattern: "^[A-Z0-9]{3,20}$",
  /** The only payout methods the programme offers. */
  payoutMethods: ["USDT", "Syriatel Cash / MTN Cash", "bank transfer", "Wise"],
  /** Public sentence, printed by /affiliate and by the admin surface. */
  commissionNote:
    "20% of the net amount received, on the first paid order only. Pending at activation, approved 14 days later unless refunded.",
  /** Conduct + fraud, verbatim in one place so the page and the rules agree. */
  conduct: [
    "Disclose the partnership wherever you promote Katzu.",
    "No fake testimonials and no invented results.",
    "No promises of a visa, an exam result or a job.",
    "No spam and no misleading ads.",
    "Self-referral (the same Google account, email or payment sender) voids the commission.",
    "One commission per referred account; abuse voids future commissions.",
  ],
};

export const AFFILIATE_STATUSES = ["active", "paused"];

const CODE_RE = new RegExp(AFFILIATE_CONFIG.codePattern);

/* ------------------------------------------------------------------ */
/* Pure helpers — every rule below is unit-tested                      */
/* ------------------------------------------------------------------ */

/** Upper-cases and trims, or returns null. Never "cleans" a bad code. */
export function normalizeAffiliateCode(raw) {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export function isValidAffiliateCode(raw) {
  return normalizeAffiliateCode(raw) !== null;
}

/** 20% of net, rounded once. Negative nets clamp to zero for a new commission. */
export function commissionCents(netCents, rate = AFFILIATE_CONFIG.rate) {
  const net = Math.max(0, Math.trunc(Number(netCents) || 0));
  return Math.round(net * rate);
}

/**
 * What the learner paid for a redeemed duration, from the same plan table the
 * pricing page and the paywall read. 0 means "not a sold duration" — no
 * commission rather than a guessed one.
 *
 * The table is passed in rather than imported: `cloudflare-pricing.js` imports
 * `pricing.config.json` without an import attribute (valid in Workers, invalid
 * in Node ESM), and this module is bundled by the site build in Node. The
 * Worker already has `PLANS`; it does the lookup at the call site.
 */
export function netAmountForMonths(months, plans = []) {
  const wanted = Math.max(1, Math.trunc(Number(months) || 0));
  const plan = (plans || []).find((row) => row.months === wanted);
  return plan ? plan.amountCents : 0;
}

export function addDaysIso(iso, days) {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + days * 86400000).toISOString();
}

/** The moment a pending commission becomes payable. */
export function approveAfterIso(activatedAt, days = AFFILIATE_CONFIG.approvalDays) {
  return addDaysIso(activatedAt, days);
}

/** Day 14 is approval day — not day 13, not on redemption. */
export function isApprovalDue(commission, now = new Date()) {
  if (!commission || commission.status !== "pending") return false;
  const due = new Date(commission.approve_after || "");
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() <= now.getTime();
}

/**
 * Self-referral: the partner's own contact email is the referred account's
 * Google email, or the payment sender when one is recorded. Case-insensitive.
 */
export function isSelfReferral({ affiliateContact, accountEmail, paymentEmail } = {}) {
  const normalize = (value) =>
    typeof value === "string" ? value.trim().toLowerCase() : "";
  const partner = normalize(affiliateContact);
  if (!partner) return false;
  return [accountEmail, paymentEmail].some((value) => normalize(value) === partner);
}

/** The next payout weekday at 00:00 UTC, strictly after `now`. */
export function nextPayoutDate(now = new Date(), weekday = AFFILIATE_CONFIG.payoutWeekday) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const delta = ((weekday - date.getUTCDay() + 7) % 7) || 7;
  return new Date(date.getTime() + delta * 86400000);
}

/**
 * Groups the approved, unpaid rows into payout batches.
 *
 * A balance under the minimum is CARRIED — reported, never dropped and never
 * paid. Negative rows (a refund after payout) are part of the balance, so a
 * partner who refunded more than they earned correctly carries a debit.
 */
export function buildPayoutBatch(rows, { minPayoutCents = AFFILIATE_CONFIG.minPayoutCents } = {}) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!row || row.status !== "approved" || row.paid_at) continue;
    const id = String(row.affiliate_id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  const batches = [];
  const carried = [];
  for (const [affiliateId, group] of groups) {
    const totalCents = group.reduce((sum, row) => sum + Math.trunc(Number(row.amount) || 0), 0);
    const entry = {
      affiliate_id: group[0].affiliate_id,
      commission_ids: group.map((row) => row.id),
      total_cents: totalCents,
    };
    if (totalCents >= minPayoutCents) batches.push(entry);
    else carried.push(entry);
  }
  batches.sort((a, b) => String(a.affiliate_id).localeCompare(String(b.affiliate_id)));
  carried.sort((a, b) => String(a.affiliate_id).localeCompare(String(b.affiliate_id)));
  return { batches, carried };
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const usd = (cents) => (Math.trunc(Number(cents) || 0) / 100).toFixed(2);

/**
 * The payout CSV. Amounts are USD with two decimals; the last row is the TOTAL
 * of exactly the rows above it, so a spreadsheet and the admin screen agree.
 */
export function payoutCsv({ affiliate, rows }) {
  const header = [
    "affiliate_code",
    "affiliate_name",
    "payout_method",
    "payout_details",
    "order_ref",
    "referred_account_id",
    "net_amount_usd",
    "rate",
    "amount_usd",
    "status",
    "activated_at",
    "paid_at",
    "payout_ref",
  ];
  const lines = [header.join(",")];
  let total = 0;
  for (const row of rows || []) {
    total += Math.trunc(Number(row.amount) || 0);
    lines.push(
      [
        affiliate?.code,
        affiliate?.name,
        affiliate?.payout_method,
        affiliate?.payout_details,
        row.order_ref,
        row.referred_account_id,
        usd(row.net_amount),
        row.rate,
        usd(row.amount),
        row.status,
        row.activated_at,
        row.paid_at,
        row.payout_ref,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  lines.push(["TOTAL", "", "", "", "", "", "", "", usd(total), "", "", "", ""].map(csvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

/* ------------------------------------------------------------------ */
/* D1 — tables are created lazily, additively                          */
/* ------------------------------------------------------------------ */

export const AFFILIATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS affiliates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    contact TEXT NOT NULL,
    payout_method TEXT NOT NULL,
    payout_details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS referrals (
    referred_account_id TEXT PRIMARY KEY,
    affiliate_id INTEGER NOT NULL,
    attributed_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    affiliate_id INTEGER NOT NULL,
    referred_account_id TEXT NOT NULL,
    order_ref TEXT NOT NULL UNIQUE,
    net_amount INTEGER NOT NULL,
    rate REAL NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    activated_at TEXT,
    approve_after TEXT,
    paid_at TEXT,
    payout_ref TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS commissions_one_per_referral
    ON commissions (referred_account_id)
    WHERE order_ref NOT LIKE 'refund:%'`,
];

/* ------------------------------------------------------------------ */
/* Capture — POST /affiliate/ref                                       */
/* ------------------------------------------------------------------ */

/**
 * Answers whether a partner code exists and is active, without returning any
 * partner data (no name, no contact, no payout details). Rate-limited by the
 * caller's durable counter; the site sets the cookie itself so a worker hiccup
 * cannot lose an attribution (an unknown code is dropped at signup instead).
 */
export async function handleAffiliateRoutes(url, request, env, cors, deps = {}) {
  if (url.pathname !== "/affiliate/ref") return null;
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const checkRateLimit =
    typeof deps.checkGlobalRateLimit === "function" ? deps.checkGlobalRateLimit : null;
  if (checkRateLimit) {
    const ip = (request.headers.get("CF-Connecting-IP") || "unknown")
      .replace(/[^a-fA-F0-9:.]/g, "")
      .slice(0, 45) || "unknown";
    const limit = await checkRateLimit(`ip:${ip}`, env, {
      scope: "affiliate-ref",
      perMinute: 30,
      perDay: 600,
    });
    if (!limit?.allowed) {
      return json({ ok: false, error: "rate_limited", retry_after: limit?.retryAfter }, 429, {
        ...cors,
        "Retry-After": String(limit?.retryAfter || 60),
      });
    }
  }

  const body = await request.json().catch(() => null);
  const code = normalizeAffiliateCode(body?.code);
  if (!code) return json({ ok: false, error: "malformed_code" }, 400, cors);
  if (!env?.DB) return json({ ok: false, error: "unavailable" }, 503, cors);

  try {
    const affiliate = await env.DB.prepare("SELECT status FROM affiliates WHERE code = ?")
      .bind(code)
      .first();
    if (!affiliate || affiliate.status !== "active") {
      return json({ ok: false, error: "unknown_code" }, 404, cors);
    }
    return json({ ok: true }, 200, cors);
  } catch {
    return json({ ok: false, error: "unavailable" }, 503, cors);
  }
}

/* ------------------------------------------------------------------ */
/* Attribution — at signup, first valid ref wins                       */
/* ------------------------------------------------------------------ */

/**
 * Attaches a partner to an account, once.
 *
 * Called from /auth/session after the registry row is written. Every branch is
 * deliberate: an unknown or paused code is ignored, a partner cannot refer
 * themselves, and the PRIMARY KEY on `referred_account_id` makes "first valid
 * ref wins" true even when two requests race (INSERT … DO NOTHING).
 */
export async function attachReferral(env, { accountId, email, code, paymentEmail } = {}) {
  const normalized = normalizeAffiliateCode(code);
  if (!normalized || !accountId || !env?.DB) return { attached: false, reason: "invalid" };

  const affiliate = await env.DB.prepare("SELECT * FROM affiliates WHERE code = ?")
    .bind(normalized)
    .first();
  if (!affiliate || affiliate.status !== "active") {
    return { attached: false, reason: "unknown_code" };
  }
  if (isSelfReferral({ affiliateContact: affiliate.contact, accountEmail: email, paymentEmail })) {
    return { attached: false, reason: "self_referral" };
  }

  const existing = await env.DB.prepare(
    "SELECT affiliate_id FROM referrals WHERE referred_account_id = ?",
  )
    .bind(accountId)
    .first();
  if (existing) return { attached: false, reason: "already_attributed" };

  await env.DB.prepare(
    `INSERT INTO referrals (referred_account_id, affiliate_id, attributed_at)
     VALUES (?, ?, ?) ON CONFLICT(referred_account_id) DO NOTHING`,
  )
    .bind(accountId, affiliate.id, new Date().toISOString())
    .run();

  return { attached: true, affiliateId: affiliate.id, code: normalized };
}

/* ------------------------------------------------------------------ */
/* Commission — at activation, exactly once per account                */
/* ------------------------------------------------------------------ */

/**
 * Books the partner's commission for the first paid order of an attributed
 * account. Returns the created row, or null when there is nothing to book.
 *
 * The checks happen here rather than in the HTTP handler so the same function
 * can be exercised by a unit test and by the live path:
 *   - no referral row → no commission
 *   - a non-sold duration → no commission
 *   - any earlier original commission for this account → no second one
 *   - `order_ref` UNIQUE + DO NOTHING → one row per activation code
 */
export async function recordAffiliateCommission(env, { accountId, netAmountCents, orderRef } = {}) {
  if (!env?.DB || !accountId || !orderRef) return null;

  const referral = await env.DB.prepare(
    "SELECT affiliate_id FROM referrals WHERE referred_account_id = ?",
  )
    .bind(accountId)
    .first();
  if (!referral) return null;

  const all = await env.DB.prepare("SELECT * FROM commissions WHERE referred_account_id = ?")
    .bind(accountId)
    .all();
  const rows = all?.results || [];
  if (rows.some((row) => !String(row.order_ref || "").startsWith("refund:"))) return null;
  if (rows.some((row) => row.order_ref === orderRef)) return null;

  const netAmount = Math.max(0, Math.trunc(Number(netAmountCents) || 0));
  if (netAmount <= 0) return null;

  const activatedAt = new Date().toISOString();
  const approveAfter = approveAfterIso(activatedAt);
  const amount = commissionCents(netAmount);

  await env.DB.prepare(
    `INSERT INTO commissions
       (affiliate_id, referred_account_id, order_ref, net_amount, rate, amount, status, activated_at, approve_after)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
     ON CONFLICT(order_ref) DO NOTHING`,
  )
    .bind(referral.affiliate_id, accountId, orderRef, netAmount, AFFILIATE_CONFIG.rate, amount, activatedAt, approveAfter)
    .run();

  const stored = await env.DB.prepare("SELECT * FROM commissions WHERE order_ref = ?")
    .bind(orderRef)
    .first();
  return stored || null;
}

/**
 * Flips every pending commission whose day has come. Called from the daily cron
 * and lazily before the admin reads the ledger, so a late cron never shows the
 * owner a commission that is already payable as pending.
 */
export async function approveDueCommissions(env, now = new Date()) {
  if (!env?.DB) return 0;
  const all = await env.DB.prepare("SELECT * FROM commissions WHERE status = ?")
    .bind("pending")
    .all();
  const due = (all?.results || []).filter((row) => isApprovalDue(row, now));
  for (const row of due) {
    await env.DB.prepare("UPDATE commissions SET status = ? WHERE id = ?")
      .bind("approved", row.id)
      .run();
  }
  return due.length;
}

/**
 * A refund. Before payout the commission is voided; after payout a negative
 * approved row is booked so the next batch deducts it. Either way the partner's
 * balance ends up where it should, without deleting history.
 */
export async function voidCommission(env, { orderRef, reason = "" } = {}) {
  if (!env?.DB || !orderRef) return { ok: false, error: "missing_order_ref" };
  const row = await env.DB.prepare("SELECT * FROM commissions WHERE order_ref = ?")
    .bind(orderRef)
    .first();
  if (!row) return { ok: false, error: "not_found" };
  if (row.status === "void") return { ok: true, already: true };

  if (row.paid_at) {
    const refundRef = `refund:${row.order_ref}`;
    const existing = await env.DB.prepare("SELECT id FROM commissions WHERE order_ref = ?")
      .bind(refundRef)
      .first();
    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO commissions
           (affiliate_id, referred_account_id, order_ref, net_amount, rate, amount, status, activated_at, approve_after, paid_at, payout_ref)
         VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)`,
      )
        .bind(
          row.affiliate_id,
          row.referred_account_id,
          refundRef,
          -Math.abs(Number(row.net_amount) || 0),
          row.rate,
          -Math.abs(Number(row.amount) || 0),
          new Date().toISOString(),
          new Date().toISOString(),
          null,
          reason ? `refund:${reason}` : "refund",
        )
        .run();
    }
    return { ok: true, deducted: true, refund_ref: refundRef };
  }

  await env.DB.prepare("UPDATE commissions SET status = ? WHERE id = ?")
    .bind("void", row.id)
    .run();
  return { ok: true, voided: true };
}

/* ------------------------------------------------------------------ */
/* Admin — dispatched from cloudflare-admin.js after admin auth        */
/* ------------------------------------------------------------------ */

const PREFIX = "/admin/api/affiliates";

function affiliateToPublic(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contact: row.contact,
    payout_method: row.payout_method,
    payout_details: row.payout_details,
    status: row.status,
    created_at: row.created_at,
  };
}

async function allRows(env, sql, ...args) {
  const result = await env.DB.prepare(sql).bind(...args).all();
  return result?.results || [];
}

function totalsByAffiliate(rows) {
  const totals = new Map();
  for (const row of rows) {
    const key = String(row.affiliate_id);
    const entry = totals.get(key) || {
      pending_cents: 0,
      approved_cents: 0,
      paid_cents: 0,
      void_cents: 0,
    };
    const amount = Math.trunc(Number(row.amount) || 0);
    if (row.status === "pending") entry.pending_cents += amount;
    if (row.status === "approved") entry.approved_cents += amount;
    if (row.status === "paid") entry.paid_cents += amount;
    if (row.status === "void") entry.void_cents += amount;
    totals.set(key, entry);
  }
  return totals;
}

/**
 * The operator endpoints. `deps.json` is the admin module's JSON envelope, so
 * there is exactly one shape for every admin response and one CORS policy.
 * Returns null for anything it does not own, keeping the admin router's
 * contract unchanged.
 */
export async function handleAffiliateAdminRoutes(url, request, env, cors, deps = {}) {
  const path = url.pathname;
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return null;
  const send = typeof deps.json === "function" ? deps.json : json;
  if (!env?.DB) return send({ error: "database_unavailable" }, 503, cors);

  const action = path.slice(PREFIX.length).replace(/^\//, "");
  const method = request.method;

  // Approval is lazy as well as scheduled: the owner must never see a payable
  // commission still marked pending because the cron has not run yet.
  await approveDueCommissions(env).catch(() => 0);

  try {
    if (action === "" && method === "GET") {
      const affiliates = await allRows(env, "SELECT * FROM affiliates");
      const commissions = await allRows(env, "SELECT * FROM commissions");
      const totals = totalsByAffiliate(commissions);
      return send(
        {
          affiliates: affiliates.map((row) => ({
            ...affiliateToPublic(row),
            ...(totals.get(String(row.id)) || {
              pending_cents: 0,
              approved_cents: 0,
              paid_cents: 0,
              void_cents: 0,
            }),
          })),
        },
        200,
        cors,
      );
    }

    if (action === "create" && method === "POST") {
      const body = await request.json().catch(() => null);
      const code = normalizeAffiliateCode(body?.code);
      const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
      const contact = typeof body?.contact === "string" ? body.contact.trim().slice(0, 160) : "";
      const payoutMethod = typeof body?.payout_method === "string" ? body.payout_method.trim() : "";
      const payoutDetails =
        typeof body?.payout_details === "string" ? body.payout_details.trim().slice(0, 300) : "";

      if (!code) return send({ error: "invalid_code" }, 400, cors);
      if (!name || !contact.includes("@")) return send({ error: "invalid_contact" }, 400, cors);
      if (!AFFILIATE_CONFIG.payoutMethods.includes(payoutMethod)) {
        return send({ error: "invalid_payout_method" }, 400, cors);
      }
      if (!payoutDetails) return send({ error: "missing_payout_details" }, 400, cors);

      const clash = await env.DB.prepare("SELECT id FROM affiliates WHERE code = ?").bind(code).first();
      if (clash) return send({ error: "code_taken" }, 409, cors);

      await env.DB.prepare(
        `INSERT INTO affiliates (code, name, contact, payout_method, payout_details, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      )
        .bind(code, name, contact, payoutMethod, payoutDetails, new Date().toISOString())
        .run();
      const created = await env.DB.prepare("SELECT * FROM affiliates WHERE code = ?").bind(code).first();
      return send({ affiliate: affiliateToPublic(created) }, 201, cors);
    }

    if (action === "commissions" && method === "GET") {
      const affiliateId = url.searchParams.get("affiliate_id");
      const status = url.searchParams.get("status");
      let rows = await allRows(env, "SELECT * FROM commissions");
      if (affiliateId) rows = rows.filter((row) => String(row.affiliate_id) === String(affiliateId));
      if (status) rows = rows.filter((row) => row.status === status);
      const { batches, carried } = buildPayoutBatch(rows);
      return send({ commissions: rows, payout: { batches, carried } }, 200, cors);
    }

    if (action === "void" && method === "POST") {
      const body = await request.json().catch(() => null);
      const result = await voidCommission(env, {
        orderRef: body?.order_ref,
        reason: body?.reason,
      });
      return send(result, result.ok ? 200 : 400, cors);
    }

    if (action === "payout" && method === "POST") {
      const body = await request.json().catch(() => null);
      const affiliateId = body?.affiliate_id;
      const payoutRef = typeof body?.payout_ref === "string" ? body.payout_ref.trim().slice(0, 80) : "";
      if (!affiliateId) return send({ error: "missing_affiliate_id" }, 400, cors);
      if (!payoutRef) return send({ error: "missing_payout_ref" }, 400, cors);

      const all = await allRows(env, "SELECT * FROM commissions WHERE affiliate_id = ?", affiliateId);
      const { batches } = buildPayoutBatch(all);
      const batch = batches.find((item) => String(item.affiliate_id) === String(affiliateId));
      if (!batch) {
        const total = all
          .filter((row) => row.status === "approved" && !row.paid_at)
          .reduce((sum, row) => sum + Math.trunc(Number(row.amount) || 0), 0);
        return send(
          {
            error: "below_minimum",
            total_cents: total,
            min_cents: AFFILIATE_CONFIG.minPayoutCents,
          },
          409,
          cors,
        );
      }

      const paidAt = new Date().toISOString();
      for (const id of batch.commission_ids) {
        await env.DB.prepare(
          "UPDATE commissions SET status = 'paid', paid_at = ?, payout_ref = ? WHERE id = ?",
        )
          .bind(paidAt, payoutRef, id)
          .run();
      }
      return send(
        {
          paid: true,
          payout_ref: payoutRef,
          total_cents: batch.total_cents,
          commission_ids: batch.commission_ids,
        },
        200,
        cors,
      );
    }

    if (action === "payout.csv" && method === "GET") {
      const affiliateId = url.searchParams.get("affiliate_id");
      if (!affiliateId) return send({ error: "missing_affiliate_id" }, 400, cors);
      const affiliate = await env.DB.prepare("SELECT * FROM affiliates WHERE id = ?")
        .bind(affiliateId)
        .first();
      if (!affiliate) return send({ error: "not_found" }, 404, cors);

      const all = await allRows(env, "SELECT * FROM commissions WHERE affiliate_id = ?", affiliateId);
      const { batches } = buildPayoutBatch(all);
      const batch = batches.find((item) => String(item.affiliate_id) === String(affiliateId));
      if (!batch) {
        const total = all
          .filter((row) => row.status === "approved" && !row.paid_at)
          .reduce((sum, row) => sum + Math.trunc(Number(row.amount) || 0), 0);
        return send({ error: "below_minimum", total_cents: total, min_cents: AFFILIATE_CONFIG.minPayoutCents }, 409, cors);
      }

      const rows = all.filter((row) => batch.commission_ids.includes(row.id));
      return new Response(payoutCsv({ affiliate, rows }), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="affiliate-${affiliate.code}-${new Date().toISOString().slice(0, 10)}.csv"`,
          ...cors,
        },
      });
    }

    return send({ error: "not_found" }, 404, cors);
  } catch (e) {
    console.error("[affiliate] admin route failed:", String(e?.message || e).slice(0, 160));
    return send({ error: "affiliate_ledger_unavailable" }, 503, cors);
  }
}

/* ------------------------------------------------------------------ */

// Kept local so this module has no CORS dependency and can be imported by a
// unit test on its own; the worker passes its own `json` where it has one.
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
