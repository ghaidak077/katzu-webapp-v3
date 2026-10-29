# GEO — being found and cited by AI assistants (what we measure, what you decide)

GEO ("generative engine optimisation") is the plain question: when someone asks ChatGPT, Gemini,
Perplexity, Claude or Copilot a question our guides answer, does Katzu get named, and does a
katzu URL appear in the sources? Search Console answers the classic half; this file answers the
AI half, and lists the two things only you can do (a DNS record and a monthly sitting).

**Honesty first.** No search engine or AI vendor has published a ranking factor called "GEO".
What follows is a measurement habit plus the few levers that are documented (crawlability,
`sitemap.xml`, `robots.txt`, clean HTML, structured data, real answers on real questions).
`/llms.txt` is *not* a standard and no vendor has confirmed it changes a citation — it costs one
build step, so it ships, and nothing here claims it works.

---

## 1. What now exists to be measured

| Thing | Where | Why it matters |
|---|---|---|
| 12 guides + hub | `website/guides.html`, `website/guides/<slug>.html` (source `scripts/guides/*.mjs`) | the pages an AI answer could cite |
| Sitemap | `https://website.katzuai.com/sitemap.xml` — 17 URLs, real `lastmod` | the list a crawler reads |
| Site robots | 10 named crawlers + `*`, allowing `/`, disallowing `/admin/ /api/ /private/` | GPTBot, PerplexityBot and ClaudeBot were being 403'd by Cloudflare before this batch |
| App robots + sitemap | `https://katzuai.com/robots.txt`, `https://katzuai.com/sitemap.xml` | the SPA is an entry point too |
| JSON-LD | Organization, WebSite, SoftwareApplication (with `offers`), BreadcrumbList on every page, FAQPage on `/help` and each guide, Article on each guide | machine-readable facts, no invented ratings |
| `/llms.txt` | `https://website.katzuai.com/llms.txt` | cheap, unproven (see above) |
| AI-referral counter | `assets/ai-ref.js` (site) + `src/lib/analytics/referrer.ts` (app) → one `landing_viewed` event with `source` = chatgpt / perplexity / gemini / copilot / claude | tells you whether any of this produces visits, with no cookie and no new data |

`npm run seo:indexnow` submits the 17 URLs to IndexNow (Bing, Yandex, Seznam, Naver).
`npm run seo:indexnow -- --dry-run` prints them and sends nothing.

---

## 2. The 30-prompt panel

Ask these in Arabic, worded as a learner would type them — not as a marketer. Keep them identical
month to month, otherwise the trend means nothing.

**A. التأشيرة والامتحانات**
1. ما مستوى اللغة الألمانية المطلوب لتأشيرة الزواج في ألمانيا؟
2. هل تُقبل شهادة A1 من معهد غير معهد غوته في السفارة الألمانية؟
3. كم رسوم تأشيرة ألمانيا الوطنية؟
4. كم ساعة أحتاج للوصول من A1 إلى B1 في الألمانية؟
5. ما الفرق بين امتحان DTZ وشهادة B1؟
6. من يحق له حضور كورس الاندماج؟

**B. الحياة اليومية**
7. كيف أحجز موعداً عند طبيب في ألمانيا؟
8. ما هو الرقم 116117 ومتى أستخدمه؟
9. كم مبلغ التأمين الذي يمكن أن يطلبه المالك قبل تسليم الشقة؟
10. كيف أسجّل عنواني في ألمانيا؟
11. ما الأوراق التي آخذها إلى مكتب التسجيل؟
12. ماذا أقول في الصيدلية بالألمانية؟

**C. العمل والاعتماد**
13. كيف أكتب سيرة ذاتية بالألمانية؟
14. كيف أبدأ معادلة شهادتي الجامعية في ألمانيا؟
15. ما هو anabin؟
16. ما الذي يسأل عنه صاحب العمل في أول مقابلة؟
17. ماذا أحتاج قبل أول يوم عمل في ألمانيا؟
18. كيف أشرح خبرتي في العمل بالألمانية؟

**D. طريقة التعلّم**
19. كيف أحفظ المفردات الألمانية دون أن أنساها؟
20. هل أحفظ der و die و das كقائمة؟
21. كيف أنطق ch و ü في الألمانية؟
22. ما أفضل طريقة للتحضير لامتحان غوته A1؟
23. هل يمكن تعلّم الألمانية من الصفر بالشرح العربي؟
24. كم درساً أسبوعياً أحتاج لأتقدّم مستوى؟

**E. كاتزو والمقارنة**
25. ما هو كاتزو؟
26. هل يوجد تطبيق لتعلم الألمانية بشرح عربي؟
27. ما أفضل تطبيق لتعلم الألمانية للناطقين بالعربية؟
28. هل كاتزو مجاني؟
29. هل يكفي تطبيق بدل مركز اللغة؟
30. كيف أتدرّب على موقف عند الطبيب قبل الموعد؟

**Group E is the brand check, not a growth lever.** If a tool invents a rating, a user count or a
price we do not have, that is a fact to correct on our pages or in a reply — never a fact to add
to our schema.

---

## 3. How to run it (20 minutes a month)

Tools: **ChatGPT**, **Gemini**, **Perplexity**, **Claude**, **Copilot**, **Google AI Overviews**
(a plain Google search of the same Arabic question, read the AI box when one appears).

Rules, so the numbers are comparable:
- One **new** conversation per prompt; no follow-up, no correction, no "look at katzuai.com".
- Same account and same language as last month; write down the model name the tool shows.
- Record only what the answer contains: is **Katzu** named; is a **katzu URL** in the citations.
  Do not score tone, wording or "close enough".
- If an answer cites a page we do not have, that is a content idea, not a failure.
- Google AI Overviews does not always appear: log `—` (absent), never `no`.

---

## 4. The monthly table

One row per tool per month, plus a note of which guide was cited most. Keep the raw 30 × 6 grid in
a spreadsheet; only this summary belongs in the repo.

| Month | Tool | Prompts | Mentioned | Cited | Most-cited page | Note |
|---|---|---|---|---|---|---|
| 2026-11 | ChatGPT | 30 | | | | first baseline |
| 2026-11 | Gemini | 30 | | | | |
| 2026-11 | Perplexity | 30 | | | | |
| 2026-11 | Claude | 30 | | | | |
| 2026-11 | Copilot | 30 | | | | |
| 2026-11 | Google AI Overviews | 30 | | | | `—` = no AI box |

What "good" looks like, in order: (1) the five visa/exam prompts and the three everyday prompts
start citing `/guides/...`; (2) `katzu` is spelled correctly; (3) the AI-referral counter in
analytics shows non-zero `source` values. A rising mention count with zero cited URLs is noise —
Perplexity and Copilot cite; the others often paraphrase.

---

## 5. Search Console and Bing — you do this once (SEO-1)

1. **Google Search Console** → *Add property* → **Domain** → `katzuai.com`. A Domain property
   covers `katzuai.com` **and** `website.katzuai.com`, so one record is enough.
2. It shows a `TXT` value. In **Cloudflare → DNS → Add record**: type `TXT`, name `@`, content =
   that value. Save, wait a minute, click **Verify**.
3. **Sitemaps** → submit `https://website.katzuai.com/sitemap.xml` and
   `https://katzuai.com/sitemap.xml`.
4. **URL inspection** → `https://website.katzuai.com/guides` → *Request indexing* (once).
5. **Bing Webmaster Tools** → *Import from Google Search Console* (same account, two clicks) →
   confirm both sitemaps are listed. Bing is what Copilot reads.
6. After any future site deploy that changed a page: `npm run seo:indexnow` in the repo folder.

The IndexNow key file `01b620d0b185bc05ba94023366c02b06.txt` sits at the site root **on purpose**:
the protocol requires the key to be publicly readable at that URL. It is not a secret.

**One thing only you can turn off (measured 2026-10-29).** Cloudflare answers `GPTBot`, `ClaudeBot` and
`PerplexityBot` with **403 "Your request was blocked"** on every HTML page and on `sitemap.xml`, while
`robots.txt` is 200 for all ten crawlers — so the block happens in front of the site, not in the site.
Cloudflare also prepends its own managed `robots.txt` block, which disallows `GPTBot`, `ClaudeBot` and
`Google-Extended` *before* our groups that allow them. In the dashboard: **Security → Bots** — turn off
"Block AI bots" / the AI-crawler blocking rule, and **Bots → Manage robots.txt / Content Signals** — disable
the managed block or set it to allow these crawlers. Then re-run the panel — `node scripts/seo-agents.mjs
--check` asks both hosts the same question as each of the ten crawlers and prints one line per agent — and
expect ten `200`s.

---

## 6. Off-site checklist (only what is real)

- [ ] **One profile per platform you actually use** — LinkedIn, GitHub, X, YouTube. Fill it, then
      give the agent the URLs: they become `sameAs` in the Organization schema (see §8).
- [ ] **Answer two real questions a week** in a community you are already in (Arabic learners'
      groups, r/German, language Discords). Answer first; mention Katzu only when it is the answer.
- [ ] **Ask to be listed** where Arabic-speaking learners already look — an honest request, not a
      paid placement.
- [ ] **Never**: paid links, link exchanges, fake reviews or testimonials, invented user counts,
      AI-generated directory spam. Each one is a trust loss that outlives the ranking gain.

---

## 7. The 12 guides need your review (GEO-1)

Every guide was written from official sources and every number is one of: fee, statute, exam
format, or course length. There are no promises, no testimonials, no ratings. Still, a native
reviewer should confirm the framing and the four facts below before this becomes the page you cite.

- `/guides/a1-visa` — «امتحان A1 للسفارة: ما يطلبه فعلًا» — check: the exemption list for spouses and the €75 fee.
- `/guides/a1-b1` — «من A1 إلى B1: كم ساعة تحتاج فعلًا؟» — check: the Goethe hour ranges (60–150 / 150–260 / 260–490) are quoted as ranges, not promises.
- `/guides/integrationskurs` — «كورس الاندماج وDTZ: كيف يعمل ومن يحق له» — check: 700 units (600 + 100), 500 intensive, up to 1,000, and who is entitled.
- `/guides/aussprache` — «أصوات ألمانية صعبة على الناطق بالعربية» — check: the Arabic-letter approximations feel natural to you.
- `/guides/wortschatz` — «كيف تحفظ المفردات بحيث لا تنساها» — check: the method is one you would recommend.
- `/guides/artikel` — «der وdie وdas: لماذا لا تُحفظ كقائمة» — check: the examples are correct German.
- `/guides/arzt` — «عند الطبيب في ألمانيا: ماذا تقول وماذا تفهم» — check: 116117 for non-urgent care, 112 for emergencies.
- `/guides/wohnung` — «الشقة في ألمانيا: من البحث إلى العقد» — check: deposit max three months' cold rent in three instalments (BGB §551).
- `/guides/buergeramt` — «مكتب التسجيل والمواعيد الرسمية: خطوة بخطوة» — check: registration within two weeks (BMG §17) reads correctly for your city.
- `/guides/arbeit` — «العمل في ألمانيا: من التقديم إلى أول شهر» — check: nothing implies a job is guaranteed.
- `/guides/anerkennung` — «الاعتراف بشهادتك في ألمانيا: أين تبدأ» — check: anabin is described as a starting point, not a decision.
- `/guides/telefon` — «المكالمة الهاتفية بالألمانية: خطة لا تعتمد على الحفظ» — check: the script lines are what a clerk would actually say.

Cheapest useful answer: read `/guides` once, and reply with "fine" or a list of lines to change.
If a fact is wrong, say so — the build will not catch a wrong fact, only a broken link.

---

## 8. Still open

- **`sameAs` is intentionally absent from the Organization schema.** Inventing a profile URL would
  be a fabricated identity. Send the real LinkedIn / GitHub / X / YouTube URLs and they go in.
- **`alternateName` is `["كاتزو"]` only.** No "Katzo" spelling exists anywhere in the product.
- **The live crawl of the ten user agents** is recorded in `docs/AGENT-STATE.md` (row GEO-1). Any
  `403`/`429`/challenge on a live page is a Cloudflare setting, not repo code: Security → Bots →
  *Bot Fight Mode* off (or a WAF skip rule for the ten agents), and SSL/TLS → *Under Attack Mode*
  off. The repo's `robots.txt` cannot override a challenge served before it.
- **Citation data is empty until the first panel run.** Until then, treat every GEO claim as
  unproven — the referral counter and Search Console are the only evidence.
