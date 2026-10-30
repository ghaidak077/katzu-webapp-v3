# `scripts/language-data/` — the authored language corpus

Two hand-authored files feed one generator. Nothing here runs at runtime in the app; the
generator (`scripts/build-language-data.mjs`) validates them against the live content and emits
the two modules the app actually ships (`src/lib/conversation/openerGlosses.generated.ts`,
`src/lib/vocabulary/wordGlossary.generated.ts`).

| File | What it holds | Shape |
|---|---|---|
| `content-snapshot.json` | The live content the corpus was validated against (scenarios + vocabulary), so generation and tests work offline | `{ fetchedAt, scenarios: [...], vocabulary: [...] }` |
| `opener-translations.json` | Modern Standard Arabic for every distinct scenario opener | `{ "<german opener>": "<arabic>" }` |
| `word-glosses.json` | One entry per German token that appears in an opener | `{ "<token>": ["<lemma>", "<arabic>", "<part of speech>", "<level>"] }`, optional 5th element `["<part>", "<part>"]` for a compound |

Token rules: lowercase, as it appears in the opener (inflected forms get their own entry and point
at the lemma — `ist` → lemma `sein`). Parts of speech use the app's own English vocabulary
(`noun`, `verb`, `adjective`, `adverb`, `pronoun`, `article`, `preposition`, `conjunction`,
`numeral`, `interjection`, `particle`, `proper noun`, `phrase`). Levels are `A0`–`B2`.

## Regenerate

```bash
node scripts/build-language-data.mjs            # validate the corpus against the live content, rebuild both modules
node scripts/build-language-data.mjs --offline  # use content-snapshot.json instead of fetching
node scripts/build-language-data.mjs --ai       # draft missing translations with GEMINI_API_KEYS (authoring only)
```

The generator exits non-zero when any opener has no Arabic, any opener token has no gloss, or a
gloss is malformed — so `npm test` cannot pass on an incomplete corpus.

## Why the translations were written here and not fetched from a dictionary

Checked live on 2026-10-30, before writing any of it:

- **FreeDict has no German–Arabic dictionary.** Its published index lists the German pairs as
  `deu-{bul,cat,ces,dan,ell,eng,fin,fra,gle,ind,ita,jpn,kur,lit,nld,pol,por,rus,spa,swe,tur}`;
  Arabic appears only as `ara-eng` / `eng-ara`. German→Arabic would be a two-hop
  (German→English→Arabic) guess, and each FreeDict database carries its own licence.
- **Kaikki / Wiktionary cannot serve this either.** The German extract is 2.9 GB of JSONL
  (295.8 MB gzipped); the Kaikki German dictionary page itself ships a 1.0 GB postprocessed file.
  Its glosses are **English**, and Wiktionary text is dual-licensed **CC BY-SA 4.0 + GFDL** —
  attribution plus share-alike on derivative data. That is both an obligation and two orders of
  magnitude over the app's ~5 MB precache budget.

So the graded content carries an authored corpus (the way the rest of Katzu's content is authored
and reviewed), and a word that is not in it falls back to one cached AI lookup per lemma
(`POST /ai/word`, KV-cached, keyed by lemma). If an open **German–Arabic** list under a permissive
licence ever shows up, it is a swap of one generated module — nothing else changes.
