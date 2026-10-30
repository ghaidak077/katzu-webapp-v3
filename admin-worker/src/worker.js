/**
 * Katzu admin panel — a separate Worker in front of the product Worker.
 *
 * Three doors, all locked by default:
 *   1. Cloudflare Access must be configured (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`).
 *      Until it is, every page and API answers 503 — the panel ships disabled.
 *   2. Every request must carry a valid Access JWT for that audience.
 *   3. Every `/api/*` call becomes an internal call to the product Worker over a
 *      Service Binding, carrying the shared internal token from KV. That token is
 *      created here on first use and never leaves these two Workers.
 *
 * The panel has no database binding and no AI keys. It cannot read a key value,
 * and its only write surfaces are the ones `/internal/admin/*` already exposes.
 */

import {
  accessConfigured,
  accessTokenFrom,
  verifyAccessJwt,
} from "./access.js";

// Must match `INTERNAL_TOKEN_KV_KEY` in ../cloudflare-admin-api.js. Keyed by a
// name, not a value, so the two Workers can share one namespace without ever
// printing what is inside it.
export const INTERNAL_TOKEN_KV_KEY = "internal:admin-token";
const INTERNAL_TOKEN_PREFIX = "ika_";

const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cache-control": "no-store",
};

function withSecurityHeaders(headers) {
  const out = new Headers(headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.set(name, value);
  return out;
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: withSecurityHeaders({
      "content-type": "application/json; charset=utf-8",
      ...extra,
    }),
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: withSecurityHeaders({ "content-type": "text/html; charset=utf-8" }),
  });
}

export function generateInternalToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return INTERNAL_TOKEN_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readInternalToken(env) {
  try {
    return (await env?.USER_PROGRESS?.get(INTERNAL_TOKEN_KV_KEY)) || "";
  } catch {
    return "";
  }
}

/**
 * Read the shared token, creating it only when the namespace has none. The write
 * is awaited so the first panel call cannot race its own token.
 */
export async function getOrCreateInternalToken(env) {
  const existing = await readInternalToken(env);
  if (existing) return existing;
  const generated = generateInternalToken();
  try {
    await env.USER_PROGRESS.put(INTERNAL_TOKEN_KV_KEY, generated);
  } catch {
    return "";
  }
  return (await readInternalToken(env)) || generated;
}

/**
 * Forward one panel call to the product Worker. The path prefix is rewritten
 * here, so the browser never learns the internal route name; the token is added
 * here, so it never reaches the browser.
 */
export async function proxyToApi(request, env, url) {
  const suffix = url.pathname.slice("/api".length);
  // `/api/overview` -> `/internal/admin/overview`; the internal prefix lives in
  // exactly one place, the product Worker's contract.
  const target = `https://internal/internal/admin${suffix}${url.search}`;
  const token = await getOrCreateInternalToken(env);
  if (!token) return json({ error: "internal_token_unavailable" }, 503);

  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept", "application/json");
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType.slice(0, 120));

  const method = String(request.method || "GET").toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const send = async (bearer) => {
    const attemptHeaders = new Headers(headers);
    attemptHeaders.set("authorization", `Bearer ${bearer}`);
    try {
      return await env.KATZU_API.fetch(
        new Request(target, { method, headers: attemptHeaders, body }),
      );
    } catch {
      return null;
    }
  };

  let response = await send(token);
  if (response && response.status === 401) {
    // The token may have been rotated by the other Worker. Re-read once; a
    // second 401 is a real refusal and is passed through.
    const fresh = await readInternalToken(env);
    if (fresh && fresh !== token) response = await send(fresh);
  }
  if (!response) return json({ error: "api_unreachable" }, 502);

  const outHeaders = new Headers();
  for (const name of ["content-type", "content-disposition", "retry-after"]) {
    const value = response.headers.get(name);
    if (value) outHeaders.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    headers: withSecurityHeaders(outHeaders),
  });
}

/** Do not reveal whether the panel is configured versus the token being wrong. */
function unauthorized() {
  return json({ error: "unauthorized" }, 401, { "www-authenticate": "Bearer" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Liveness only. Carries no data and needs no identity, so a deployment can
    // be verified without an Access session.
    if (url.pathname === "/healthz") {
      return json({ ok: true, service: "katzu-admin" });
    }

    if (!accessConfigured(env)) {
      return html(
        "<!doctype html><meta charset=\"utf-8\"><title>Katzu Admin</title>" +
          "<body style=\"font-family:system-ui;padding:40px;max-width:640px\">" +
          "<h1>Panel disabled</h1><p>Cloudflare Access is not configured for this panel. " +
          "Set <code>ACCESS_TEAM_DOMAIN</code> and <code>ACCESS_AUD</code>, then redeploy.</p></body>",
        503,
      );
    }

    const token = accessTokenFrom(request);
    const checked = await verifyAccessJwt(token, {
      teamDomain: String(env.ACCESS_TEAM_DOMAIN || "").trim(),
      aud: String(env.ACCESS_AUD || "").trim(),
    });
    if (!checked.ok) {
      console.log("[admin-panel] denied", JSON.stringify({ reason: checked.reason }));
      return unauthorized();
    }

    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    if (isApi) return proxyToApi(request, env, url);

    if (!env?.ASSETS?.fetch) return json({ error: "assets_unavailable" }, 503);
    const asset = await env.ASSETS.fetch(request);
    return new Response(asset.body, {
      status: asset.status,
      headers: withSecurityHeaders(asset.headers),
    });
  },
};
