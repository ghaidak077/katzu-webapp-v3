# Katzu — translation glossary and voice guide

One page, and every English and Indonesian line in the product has to obey it.
It exists because twenty-plus batches written months apart drift: without a
termbase the same button becomes `Continue`, `Next` and `Proceed`, and the
learner reads three different apps.

Arabic is the **reference**, not a source to transliterate. English and
Indonesian are written as native copy for the same situation — same information,
same register, same length budget — the way the Arabic was written.

## 1. What Katzu sounds like

| | Arabic (reference) | English | Indonesian |
| --- | --- | --- | --- |
| Address | أنت، مباشر | you, direct | **kamu**, direct |
| Register | واثق، هادئ، بلا مبالغة | confident, calm, no hype | percaya diri, tenang |
| Sentence shape | قصيرة، فعل أولاً | short, verb first | pendek, kata kerja dulu |
| Humour | جافّ، نادر | dry, rare | kering, jarang |
| Exclamation marks | لا | none | none |
| Emoji | فقط في التهنئة | only in celebration | hanya saat perayaan |

Rules that follow from it:

1. **Never add a sentence.** If the Arabic says «جرّب محاكاة B1 مجاناً — محادثة واحدة بثلاثة أجزاء», the English is one line, not a paragraph explaining the mock exam.
2. **Never soften a limit.** "3 free conversations" stays a number in every language. `freeSessionsCopy` is the only place that phrasing lives.
3. **No motivational filler.** No "Let's get started!", no "Great job!". The app states what happened.
4. **Name the thing.** A button says what it opens («ابدأ التدريب» → *Start practice*), never a bare «متابعة» → *Continue* where a name is available.
5. **Second person, never "we".** The product is Katzu, addressed as `I` only where the mascot is genuinely speaking a line.

## 2. Do not translate

| Term | Why |
| --- | --- |
| `Katzu`, `Katzu Pro` | product names |
| `A0`, `A1`, `A2`, `B1`, `B2` | CEFR levels |
| `Ausbildung`, `Bescheid`, `Anmeldung`, `Termin` | German administrative vocabulary the learner will meet in the wild — keep the German word, gloss it in the sentence |
| German example sentences | they are the *target* language |
| `Google`, `Syriatel Cash`, `MTN Cash` | provider names |
| `Goethe`, `telc`, `ÖSD` | exam bodies |

Codes and formats stay Latin/directional: activation codes (`DE-6M-…`), referral
codes, prices, URLs. Render them `dir="ltr"` and monospace; never translate a
placeholder.

## 3. Per-language notes

### English
- British spelling (`practise` verb / `practice` noun is too subtle to police — pick **practice** for both, and `-ise` consistently: *organise*, *recognise*).
- Contractions are fine (`you're`, `it's`); the tone is spoken, not corporate.
- Currency and dates stay in the learner's format from `Intl`, not hard-coded.
- "Lesson" is a *scene* (`Scenario`) in this product: use **scene** for `مشهد`, **session** for a finished conversation, **practice** for `تدريب`.

### Indonesian
- **kamu**, not *Anda* — except in payment, legal and account-deletion copy, where *Anda* is the respectful default.
- No `-lah` particle padding, no *silahkan* chains. `Coba lagi` not `Silakan mencoba kembali`.
- Keep English loanwords the audience already uses (*akun*, *sesi*, *level*, *pratinjau*); do not invent purist equivalents (`pelatihan` for *practice* reads like a seminar — use **latihan**).
- Numbers and levels stay Latin: `3 sesi`, `A1`.
- `مشهد` → **adegan**; `جلسة` → **sesi**; `تدريب` → **latihan**; `مراجعة` → **ulasan**; `رصيد` → **saldo**.

## 4. Termbase

| Key concept | Arabic | English | Indonesian |
| --- | --- | --- | --- |
| scene / situation | مشهد / موقف | scene | adegan |
| session | جلسة | session | sesi |
| practice | تدريب | practice | latihan |
| review | مراجعة | review | ulasan |
| free allowance | رصيد الجلسات التجريبية | free allowance | jatah gratis |
| subscription | اشتراك | subscription | langganan |
| activation code | كود تفعيل | activation code | kode aktivasi |
| streak | سلسلة الأيام | streak | runtutan hari |
| daily tasks | مهام اليوم | today's tasks | tugas hari ini |
| level | مستوى | level | level |
| correction | تصحيح | correction | koreksi |
| hint | تلميح | hint | petunjuk |
| goal | هدف | goal | tujuan |
| journey / trail | الرحلة | journey | perjalanan |
| profile | الملف | profile | profil |
| offer / plan | عرض / خطة | offer / plan | penawaran / paket |

## 5. Length and layout

Arabic is the shortest of the three on average and English the longest. A label
that fits in Arabic can overflow in English by ~35%, and Indonesian sits between
them. Therefore:

- Button labels: ≤ 22 characters in English. If it needs more, the label is doing two things — split it.
- Headings: keep the same number of lines as the Arabic at 390 px width.
- Never rely on `text-align` to fix a longer string; use the logical utilities
  (`text-start`), and let the layout wrap.
- Numbers inside a sentence use the app's `LtrCounter`, never a plain string.

## 6. How a batch is reviewed

1. `node scripts/i18n-strings.mjs --export --batch=B2` writes a worksheet.
2. A native speaker (or the owner, for a quick pass) edits the **English** and
   **Indonesian** columns and notes anything ambiguous.
3. `node scripts/i18n-strings.mjs --apply i18n-worksheets/B2.csv` writes it back.
4. `npm run lint && npm run i18n:coverage -- --strict && npm run i18n:dir`.
5. Only then is the batch flipped in `src/lib/i18n/coverage.json`.

A worksheet is the artifact a translator can be paid for and a reviewer can
approve; the TypeScript diff is nobody's review surface.
