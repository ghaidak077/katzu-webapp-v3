/**
 * Cloudflare Access enforcement for the admin panel.
 *
 * The panel is a separate Worker. Cloudflare Access sits in front of it and adds
 * a signed `Cf-Access-Jwt-Assertion`; this module is the second lock: the Worker
 * itself refuses every page and API call unless that assertion is present, has a
 * valid RS256 signature from the team's certificate set, and names the right
 * audience. Fail closed — a missing variable, a malformed token, an unknown key
 * or a clock/issuer mismatch all answer the same way.
 *
 * No secret exists here: the team domain and the Access application audience are
 * public identifiers, and the signing keys are fetched from Cloudflare's JWKS
 * endpoint. Nothing is cached longer than ten minutes.
 *
 * `verifyAccessJwt` takes its certificate fetcher as an argument so the tests can
 * prove the signature path with a locally generated key, without a production
 * bypass variable.
 */

const CERTS_TTL_MS = 10 * 60 * 1000;
const MAX_TOKEN_LENGTH = 8192;
const certsCache = new Map();

export function accessConfigured(env) {
  const domain = String(env?.ACCESS_TEAM_DOMAIN || "").trim();
  const aud = String(env?.ACCESS_AUD || "").trim();
  return Boolean(domain && aud);
}

/** The assertion header Access adds, or the cookie it sets for a browser. */
export function accessTokenFrom(request) {
  try {
    const header = request.headers.get("cf-access-jwt-assertion");
    if (header) return header.trim();
    const cookie = request.headers.get("cookie") || "";
    for (const part of cookie.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === "CF_Authorization") return rest.join("=").trim();
    }
  } catch {
    /* an unreadable request carries no token */
  }
  return "";
}

export function decodeSegment(segment) {
  const padded = String(segment || "").replace(/-/g, "+").replace(/_/g, "/");
  const base64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(segment) {
  return JSON.parse(new TextDecoder().decode(decodeSegment(segment)));
}

/** The team's current signing keys, cached in this isolate for ten minutes. */
export async function fetchAccessCerts(teamDomain, fetchedAt = Date.now()) {
  const cached = certsCache.get(teamDomain);
  if (cached && fetchedAt - cached.at < CERTS_TTL_MS) return cached.keys;
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 600, cacheEverything: true },
  });
  if (!response.ok) throw new Error("access_certs_unavailable");
  const body = await response.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  if (!keys.length) throw new Error("access_certs_empty");
  certsCache.set(teamDomain, { at: fetchedAt, keys });
  return keys;
}

/**
 * @returns {Promise<{ok:true,payload:object}|{ok:false,reason:string}>}
 * The reason is for the Worker's log line only; the response never carries it.
 */
export async function verifyAccessJwt(token, options) {
  const {
    teamDomain,
    aud,
    now = Date.now(),
    fetchCerts = fetchAccessCerts,
  } = options || {};
  if (!teamDomain || !aud) return { ok: false, reason: "not_configured" };
  if (!token || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "no_token" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header;
  let payload;
  try {
    header = decodeJson(encodedHeader);
    payload = decodeJson(encodedPayload);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (header?.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    return { ok: false, reason: "unsupported_alg" };
  }
  if (typeof payload?.exp !== "number" || payload.exp * 1000 <= now) {
    return { ok: false, reason: "expired" };
  }
  if (typeof payload?.nbf === "number" && payload.nbf * 1000 > now + 60000) {
    return { ok: false, reason: "not_yet_valid" };
  }
  if (typeof payload?.iat === "number" && payload.iat * 1000 > now + 60000) {
    return { ok: false, reason: "issued_in_future" };
  }
  if (payload?.iss !== `https://${teamDomain}`) {
    return { ok: false, reason: "wrong_issuer" };
  }
  const audiences = Array.isArray(payload?.aud) ? payload.aud : [payload?.aud];
  if (!audiences.includes(aud)) return { ok: false, reason: "wrong_audience" };

  let keys;
  try {
    keys = await fetchCerts(teamDomain);
  } catch {
    return { ok: false, reason: "certs_unavailable" };
  }
  const jwk = (Array.isArray(keys) ? keys : []).find((key) => key?.kid === header.kid);
  if (!jwk || jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
    return { ok: false, reason: "unknown_key" };
  }

  let verified = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeSegment(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    verified = false;
  }
  if (!verified) return { ok: false, reason: "bad_signature" };
  return { ok: true, payload };
}

/** Test hook: drop the in-isolate certificate cache. */
export function resetAccessCerts() {
  certsCache.clear();
}
