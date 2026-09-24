# Katzu — Security Gaps (Phase 0)
Every item verified in source on 2026-09-24. Ordered by severity. "Launch gate" column maps to docs/launch-gate.md.

## S1. Raw Google ID token persisted + dual credential transport + raw-token fallback
- **Evidence:** Dexie `users` row keeps `idToken` (`workerClient.ts` L142); several calls send `id_token` in the body *and* `Authorization: Bearer` (L385/395, L520/534, L588, L633-637); `getEffectiveAuthToken` falls back to the raw ID token when no session token exists (L187-195).
- **Risk:** token theft surface in IndexedDB; credential confusion; expired raw tokens produce intermittent 401s.
- **Gate:** BLOCKER (Phase 1.1).

## S2. Sessions are not revocable
- **Evidence:** `session:*` KV keys have 30-day TTL only; no `/auth/signout`; sign-out and deletion never revoke; deletion doesn't enumerate sessions at all.
- **Gate:** BLOCKER (Phase 1.1/1.2).

## S3. Account deletion is incomplete and unreachable
- **Evidence:** `handleDeleteUser` (L489-513) deletes 4 KV keys + 1 D1 table; leaves `session:*`, `email_index:*`, `referral:*` claim/history keys; returns `success: true` unconditionally; no UI anywhere calls it (`grep حذف الحساب` in src/ → wrapper only).
- **Gate:** BLOCKER (Phase 1.2). GDPR-relevant.

## S4. Activation-code redemption is not atomic
- **Evidence:** `handleVerify` (L1407-1418): `get(codeKey)` → check → `put(codeKey)`. Two concurrent requests both observe "not redeemed" and both extend the account. Referral payout has the same window (`isFirstRedemption = !existingAccountRaw` evaluated pre-write).
- **Gate:** BLOCKER (Phase 1.5).

## S5. Trial quota + rate limits are isolate-local
- **Evidence:** `quotaLocks` Map (L416) and `userRateLimits` Map (L295) are in-memory per isolate; authoritative counter is KV read-modify-write (no CAS). Concurrent isolates can exceed the 3-session free ceiling; abuse control resets per isolate.
- **Gate:** BLOCKER for payment integrity (Phase 1.5).

## S6. Progress sync read-merge-write race
- **Evidence:** `handleProgressSync` (L1705): get → merge → put with no version/updatedAt guard. Two devices can silently drop each other's writes. No conflict signals returned to clients.
- **Gate:** BLOCKER (Phase 1.5).

## S7. AI request fields unbounded; client-supplied persona/title trusted in prompt
- **Evidence:** `handleAiConversationTurn` destructures `scenario_title`, `persona`, `cefr_level`, `sarcasm_level` from the body with no length caps and injects title/persona into the roleplay instruction; `cefr_level` is not checked against `VALID_LEVELS` on AI endpoints (content endpoints do check).
- **Risk:** prompt-injection via client fields; cost amplification via oversized payloads (64KB cap is the only bound).
- **Gate:** BLOCKER (Phase 1.5 / first Phase-1 slice).

## S8. CORS open-mode fallback
- **Evidence:** `getCorsHeaders` (L181-224): missing/invalid `ALLOWED_ORIGINS` + non-production env → reflects any origin with credentials. Currently safe (allowlist configured), but config loss silently reopens the worker; `ENVIRONMENT` var is not set in wrangler.toml.
- **Gate:** BLOCKER to harden (Phase 1.4): explicit dev flag required for open mode; production always fails closed.

## S9. Admin surface: browser-typed bearer secret + HTML string interpolation + inline handlers
- **Evidence:** `renderAdminDashboardHtml` embeds `admin-secret-input` (L2543), `tbody.innerHTML = …` (L3193), dozens of inline `onclick=` handlers (L2486+). ADMIN_SECRET enters browser JS memory; any XSS in the dashboard page yields full admin.
- **Gate:** BLOCKER before any admin use in production (Phase 1.x hardening; restrict origin, escape output, move secret out of page-rendered input).

## S10. TEST_MODE bypasses JWT verification
- **Evidence:** `verifyGoogleIdToken` accepts structurally-valid tokens without signature verification when `TEST_MODE` is set (L1948, used by tests). If ever set on a production deploy, authentication collapses.
- **Gate:** add deploy-time guard/refuse-to-start behavior; document loudly (Phase 1 hardening).

## S11. No data export (trust/gap, not an attack)
- **Evidence:** only diagnostics download exists in Settings.
- **Gate:** BLOCKER (Phase 1.3).

## Non-issues verified (no action needed)
- 64KB request cap enforced at entry; `boundedHistory` caps AI context; response schemas + label sanitization active; invalid Gemini keys parked 1h; fallback metrics durable in KV; CORS rejection is a hard 403 at entry today (allowlist present); no secrets in client code (Gemini keys are server-side only).
