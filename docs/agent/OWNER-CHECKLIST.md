# Owner checklist — what needs you, in plain language

Every item here is an open item in `docs/AGENT-STATE.md` § OWNER-OPEN (the detailed record); each says what
"done" looks like. `tests/agentDocs.test.ts` keeps the two lists in step. Order matters: 1 and 2 unblock most.

---

## 1. Decide the app's public address — V18-3

**What it is.** The app is at `https://katzu-webapp-v3.pages.dev`, but `robots.txt`/`sitemap.xml` advertise
`https://katzu.app/`, which does not resolve, and a store or payment listing will want a host you control.

**What you do.** Pick one:

- **Keep `pages.dev` for the closed beta** — nothing to do now, revisit before a public launch; or
- **Attach `katzu.app`** — point the domain at the Pages project in the Cloudflare dashboard, then tell the
  agent to update `robots.txt`, `sitemap.xml`, `ALLOWED_ORIGINS` and `VITE_PUBLIC_APP_URL`.

**Done looks like:** the address in `robots.txt` opens the real app, or you have decided to wait.

---

## 2. Rotate the admin secret, then load the content — V11

**What it is.** The secret used by the content-loading tool was pasted into a chat once, so it must be
treated as compromised. Right now the tool stops with `HTTP 401` and writes nothing.

**What you do**, in this order:

1. Generate a new admin secret in Cloudflare (Worker → Settings → Variables) and save it;
2. Put the **bare value** in your environment (not wrapped in `< >` — that was the earlier mistake);
3. Run the two load commands in `docs/agent/CONTENT-LOAD.md` (module 2 first, then module 1).

**Done looks like:** both commands finish without writing an error, and `node scripts/check-content-drift.mjs`
prints identical counts.

---

## 3. Three missing columns in the content database — V12, V12-1

**What it is.** The last real load stopped because the `grammar` table is missing three columns; it cleaned
up after itself, so nothing is half-loaded. The credential half is fixed (V12-1), so the schema is all that
stands between the drafts and a full load.

**What you do.** Add the three columns (this is additive and deletes nothing):

```sql
ALTER TABLE grammar ADD COLUMN rule_de TEXT;
ALTER TABLE grammar ADD COLUMN rule_ar TEXT;
ALTER TABLE grammar ADD COLUMN example_ar TEXT;
```

Then re-run the load from item 2.

**Decide at the same time:** whether the four older grammar rows (`akkusativ_articles`, `dativ_prepositions`,
`konjunktiv_ii`, `perfekt_tense`) should be renamed to the `g_*` ids the app now uses — until they are, five
of the original scenarios have no grammar row in the database.

**Done looks like:** the loader's fourth batch succeeds and the app shows grammar on those scenarios.

---

## 4. One title decision before that load — no id

**What it is.** The module-2 draft names the opening episode "Am Flughafen: das Gepäck" / «في المطار: الأمتعة»;
the live app calls it "Am Flughafen: fehlendes Gepäck" / «في المطار: الأمتعة المفقودة». Loading the draft will
soften that title.

**What you do.** Either accept the change (do nothing), or ask the agent to align the draft and re-approve it.

**Done looks like:** you know which title a learner will see.

---

## 5. Real-device voice — the last big unknown — V18-3

**What it is.** Every voice check so far ran against a simulated microphone. Whether speaking works on real
phones is still unproven, and it is the app's headline feature.

**What you do.** Follow the 14-row checklist in `docs/agent/OWNER-STEPS.md` § 2 on two real phones (one iPhone,
one Android).

**Done looks like:** each row marked pass or fail, with a note for any fail.

---

## 6. Update this machine's Node — V17-1 (not blocking)

**What it is.** This computer runs Node 24.14.0; CI and the project declare 24.15.0 or newer. The whole test
suite passes anyway — this is a declaration gap, not a failure.

**What you do.** `nvm install 24.15.0 && nvm use 24.15.0` (or `winget upgrade OpenJS.NodeJS.LTS`), then confirm
`node -v` and that `npm ci` prints no `EBADENGINE` line.

**Done looks like:** `npm ci` is quiet about engines.

---

## 7. After any content change: the drift check — V15-3

**What it is.** A read-only check that compares the content files in the repo with what is live.

**What you do.** Run `node scripts/check-content-drift.mjs` (or ask the agent to).

## 8. Give the AI pool real keys — AI-POOL (2026-10-18)

**What it is.** The app now talks to NVIDIA and OpenRouter (Gemini and Groq are out of the default
set, at your direction). Both key lists are still empty, so every AI conversation runs on the free
built-in fallback (weaker, token-capped).

**What you do.** Either open the admin dashboard's **AI Providers** tab and, for a preset or
"Custom…", paste your key(s), press **Save provider**, then **Test** — you can also disable a
built-in or delete your own, no code change or redeploy needed; keys are stored server-side and
never shown again (only a masked fingerprint). Or run `npx wrangler secret put
OPENROUTER_API_KEYS` and `npx wrangler secret put NVIDIA_API_KEYS` and paste comma-separated key
lists.

**Done looks like:** the Test button answers "OK in a few hundred ms" for at least one entry, and a
live conversation turn no longer shows the fallback model.

---

## 9. The coupon and the price — one decision (2026-10-28)

**What it is.** The site says **$60/year** with coupon `KATZU26`, but no code reads that coupon and the live
yearly tier charges **$42**.

**What you do.** Either keep `$60` as a hand-applied promo, or tell the agent to show `$42`.

**Done looks like:** the price on the site is the price checkout charges.

---

## Nothing to do — recorded so nobody re-opens them

- **Content is fully loaded and verified — V18-2.** 15 scenarios / 221 vocabulary / 111 phrases / 22 grammar,
  drift check exit 0.
- **Payments stay off for the beta.** The health endpoint reading "not ready" is the correct state.
- **`docs/LAUNCH-CHECKLIST.md` § 2 stays untouched.** Those are your items, unchanged.
- **The two Worker settings are already applied.** The emergency stop is `MAINTENANCE_MODE = "on"` on the
  running Worker, and retention runs automatically at 04:17 UTC.
