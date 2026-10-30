# Owner checklist — what only you can decide

The agent finishes everything it can verify. This file lists what is left for you,
newest first. Each item says what it is, why it needs you, and how to check it in
under a minute.

---

## 1. Proofread the shipped Arabic of every scenario opener (V30)

**Why you:** the first message of every scenario now renders its Arabic from the
bundle instead of calling the model. That removed a 503 the learner used to see
(«تعذرت الترجمة») and one AI call per conversation opened — but it also means the
Arabic is fixed text in the app, so it has to read well, not just be correct.

- **What to read:** [OWNER-LANGUAGE-REVIEW.md](OWNER-LANGUAGE-REVIEW.md) — 223
  openers, German on the first line, the Arabic the learner sees under it.
- **What to look for:** does the Arabic sound like a person talking (Modern
  Standard Arabic), not a word-for-word rendering? Would a nervous beginner
  understand it on first read? Is the register natural for a café vs. a doctor vs.
  an exam partner?
- **How to change one:** edit `scripts/language-data/opener-translations.json`
  (same order as the review list) or `scripts/language-data/word-glosses.json`,
  then run `node scripts/build-language-data.mjs` and commit the regenerated
  files. Nothing else needs editing.
- **Machine-checked already:** all 223 openers have a non-empty Arabic gloss, all
  892 distinct opener words resolve to a meaning + part of speech + level, and the
  gate fails if either coverage drops (`tests/openersStatic.test.ts`).

## 2. Give the worker an AI provider key (still open)

**Why you:** `wrangler.toml` documents `NVIDIA_API_KEYS` and `OPENROUTER_API_KEYS`
as "created empty — paste the key list to switch it on". With both empty the
provider pool has no usable credential, so **every** `/ai/*` route fails — which is
the root cause of the broken first-message translation this release removes from
the opener path, and it is still true for `/ai/turn` (a learner's typed message
needs one model call).

- **Where:** Worker secrets in the Cloudflare dashboard (`NVIDIA_API_KEYS` and/or
  `OPENROUTER_API_KEYS`), never in the repo and never in chat.
- **How to confirm:** `curl -s https://<worker>/ai/health` with the app's
  `Origin`, then send one message in a conversation. `ai_turn` log lines carry
  tier/token/cost counts once a key works.
- **What is NOT blocked:** opening a conversation, the opener's Arabic, the word
  cards, hints, and every screen. Those no longer call the model at all.

## 3. Sanity-read two new Arabic strings

The greeting guard (a bare «hallo» must not be answered with an invented answer)
ships fixed lines per level, German and Arabic side by side, in
`cloudflare-turn-guard.js` (`RE_ASK`, `ACK`). They are short and generic («كيف
حالك؟»), so a two-minute read is enough — change the strings there if you want
different wording; the tests assert shape and level caps, not exact words.

## 4. The open-dictionary decision (decided, recorded here so it is not re-litigated)

**What was asked:** for a word outside the generated data, check an open dictionary
before spending a model call. **What was checked (2026-10-30):**

| Source | Licence | Size | German → Arabic? |
| --- | --- | --- | --- |
| Kaikki German-edition extract (Wiktextract) | Wiktionary's dual licence: **CC BY-SA** + GFDL — attribution **and share-alike** | 2.9 GB JSONL (295.8 MB gz) | **No** — German-language definitions, not Arabic |
| Kaikki English-edition (de→en senses) | same dual licence | hundreds of MB | No — English, not Arabic |
| FreeDict deu-eng | **GPL** | ~10 MB | No — English |

**Decision: do not bundle any of them.** Two independent reasons, either of which
is enough: (1) none of them is German→Arabic, so the Arabic would have to be
generated anyway — the dictionary buys nothing on the axis that matters; (2)
CC BY-SA's share-alike and FreeDict's GPL both reach the derived data we would
ship inside a commercial PWA, and the 5 MB precache budget cannot hold 296 MB
compressed in any case. The path that was built instead: shipped generated data
for everything the app itself says (zero network), then **one** server-side model
lookup per lemma, cached fleet-wide and on the device (`/ai/lexeme`).

If you ever want a real dictionary, the only clean shape is a server-side index
queried behind the Worker — never a shipped bundle — and it needs a German→Arabic
lexicon whose licence permits commercial use. That is a purchase, not a download.

## 5. `/ai/lexeme` needs the same provider key as `/ai/turn`

The last-resort word lookup (a word the shipped glossary does not know) makes one
model call per lemma. With the pool still keyless it returns 503 and the card
shows its honest retry — never an invented meaning. Same fix as item 2: paste a
key in Worker secrets. Cached lemmas keep answering without one.
