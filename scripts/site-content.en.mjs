/**
 * English half of the marketing-site copy — the /en landing and its seven
 * page twins. Split from scripts/site-content.mjs to keep every file inside the
 * 500-line scripts budget (tests/codeBudgets.test.ts). Same facts, same rules.
 */

import { COUPON, START, SUBSCRIBE, SUPPORT, UPDATED } from './site-content.mjs';
/* ------------------------------------------------------------------ */
/* The English pages — the /en landing and its seven twins              */
/* ------------------------------------------------------------------ */

export const EN_HOME = {
  path: '/en',
  title: 'Katzu — learn German by speaking it',
  description:
    'Katzu is an Arabic-first AI German conversation app for Arabic speakers, A0 to B2. Real situations from life in Germany, corrections in Arabic, free 3 AI lessons a month.',
  h1: 'Speak the German you actually need — not words you memorise and forget',
  lead:
    'Practise the sentence for the embassy, the doctor and the apartment before you need it. By voice, with an immediate correction in Arabic.',
  body: `
<div class="wrap prose">
  <div class="cols2">
    <section class="pane reveal"><h2>How it works</h2><ul>
      <li>Choose one of six real situations: embassy, doctor, job interview, apartment viewing, airport, café.</li>
      <li>Hear the sentence, translate only when you get stuck.</li>
      <li>Speak or type your German — the microphone is optional.</li>
      <li>Get a correction in Arabic with the reason behind it.</li>
      <li>Every mistake returns in four review stops: today, days, week, month.</li>
    </ul></section>
    <section class="pane reveal"><h2>Free and Pro</h2><ul>
      <li><b>Free forever:</b> 3 AI lessons every month after a free Google sign-up, daily mission, spaced review, placement test, mistake bank — no card.</li>
      <li><b>Pro — a full year for 60 dollars</b> with coupon <span class="de">${COUPON}</span>: every level A0–B2, every situation, vocabulary and grammar banks, daily conversation under a fair-use ceiling.</li>
      <li>Full refund within the first 7 days. Code within 12 hours.</li>
    </ul></section>
  </div>
  <div class="callout reveal"><h2>What Katzu is not</h2><p>An independent training tool: no official Goethe/telc product, no certificate, no immigration or legal advice. Exam-format practice (Goethe · telc · DTZ, A1–B2) is being built and will ship only when ready and measurable.</p></div>
  <p class="reveal" style="margin-top:30px"><a class="btn" href="${START}">Start free</a> <a class="btn gh" href="/en/faq">Read the FAQ</a></p>
</div>`,
};

export const EN_PAGES = [
  {
    path: '/en/how-it-works',
    title: 'How Katzu works — German conversation practice, step by step',
    description:
      'How Katzu works: choose a real situation, hear and study the phrases, speak or type, get an Arabic correction, then review every mistake. Levels A0–B2.',
    h1: 'How Katzu works',
    lead:
      'From a real situation to a sentence you say yourself: study the phrases, check your understanding, speak or type, then review what needs fixing. Not a list of words without context.',
    body: `
<div class="wrap prose">
  <ol class="co">
    <li class="reveal"><b>Choose a situation</b><p>Six situations from life in Germany: the embassy, the doctor, the job interview, the apartment viewing, the airport and the café. Each one starts at your level.</p></li>
    <li class="reveal"><b>Hear it, translate when stuck</b><p>Tap the speaker to hear the correct pronunciation; the Arabic translation sits under the line and only matters when you need it.</p></li>
    <li class="reveal"><b>Speak or type</b><p>Record your German sentence or type it. The microphone is optional, and the correction comes back in Arabic immediately — a mistake is explained, never mocked.</p></li>
    <li class="reveal"><b>Get a correction with a reason</b><p>Katzu gives you the correct form and why: <span lang="de" class="de">zum Arzt</span> not <span lang="de" class="de">nach Arzt</span>, and age uses <span lang="de" class="de">sein</span>, not <span lang="de" class="de">haben</span>.</p></li>
    <li class="reveal"><b>Every mistake comes back</b><p>One mistake, four review stops: today, after days, after a week, after a month. Say it correctly at the last stop and it is yours.</p></li>
    <li class="reveal"><b>Keep the habit</b><p>A short daily mission stays open for free — review and the mistake bank are never locked behind a subscription.</p></li>
  </ol>
  <div class="callout reveal"><h2>Start free, no card</h2><p>Free gives you 3 AI lessons every month after sign-up, with the daily mission, spaced review, placement test and mistake bank. <span class="de">Pro</span> opens every level A0–B2 for a full year at <b>60 dollars</b> with coupon <span class="de">${COUPON}</span>.</p></div>
  <div class="callout reveal"><h2>What Katzu is not</h2><p>Not an official exam course, no certificate or official grade, not a replacement for a lawyer, doctor or immigration adviser. Exam-format practice (Goethe · telc · DTZ, A1–B2) ships only when ready and measurable.</p></div>
  <p class="reveal" style="margin-top:30px"><a class="btn" href="${START}">Start free</a> <a class="btn gh" href="/en/pricing">See free and Pro</a></p>
</div>`,
  },
  {
    path: '/en/who-its-for',
    title: 'Who Katzu is for — and who it is not for',
    description:
      'Katzu is for Arabic speakers preparing for life in Germany who need conversation practice from A0 to B2. See honestly who it fits and who it does not.',
    h1: 'Who Katzu is for — and who it is not for',
    lead: 'We do not sell it to everyone. An honest comparison: if you are in the first list it will help you, and if you are in the second we will say so.',
    body: `
<div class="wrap prose">
  <div class="cols2">
    <section class="pane reveal"><h2>It fits you if…</h2><ul>
      <li>You are an Arabic speaker moving to Germany for work, study or family life, and you need to speak rather than only memorise.</li>
      <li>You have just arrived and face situations like the embassy, a doctor, work or an apartment, and want to rehearse first.</li>
      <li>Your level is between A0 and B2, and you prefer Arabic explanations to a course delivered entirely in German.</li>
      <li>You want a short daily conversation by voice or text, with direct correction and four review stops per mistake.</li>
      <li>You want to know what you get before paying: 3 free lessons refreshed every month, a yearly Pro price in plain numbers, and a 7-day refund.</li>
    </ul></section>
    <section class="pane reveal"><h2>It may not fit you if…</h2><ul>
      <li>You want a comprehensive grammar textbook or a long academic curriculum; Katzu starts from situations.</li>
      <li>You want an official certificate or a guaranteed pass in Goethe, telc or DTZ; none is issued.</li>
      <li>You need legal, medical or immigration advice; use a licensed professional.</li>
      <li>You want a human tutor or a social network; Katzu is an individual practice tool.</li>
      <li>You only want flashcards without conversation; review exists, but producing German is the core.</li>
    </ul></section>
  </div>
  <div class="callout reveal"><h2>What is actually supported now</h2><p>Six situations from life in Germany — embassy, doctor, job interview, apartment viewing, airport, café — at levels A0–B2, by voice or text. Anything else is unpublished and not promised here.</p></div>
  <p class="reveal" style="margin-top:30px"><a class="btn" href="${START}">Start free</a> <a class="btn gh" href="/en/how-it-works">How it works</a></p>
</div>`,
  },
  {
    path: '/en/compare',
    title: 'Katzu compared with flashcards, courses and a human tutor',
    description:
      'An honest comparison of Katzu with flashcard apps, general courses, a human tutor and exam-prep courses: what Katzu does and what it does not claim.',
    h1: 'Katzu compared with the alternatives',
    lead: 'We do not claim Katzu is better than everything. Each tool has a different job; this is a comparison against what we can actually say about our own product.',
    body: `
<div class="wrap prose">
  <div class="compare-grid">
    <section class="pane reveal"><h2>Against flashcard apps</h2><p>Flashcards are excellent for quick recall, but they often test whether you recognise a word. Katzu asks you to produce German in a situation, by voice or text, then corrects you and turns the mistake into a review stop.</p></section>
    <section class="pane reveal"><h2>Against a general course</h2><p>A general course builds broad, sequenced progress. Katzu starts from the situations that follow a move to Germany and explains in Arabic. If you want comprehensive grammar, a general course fits better.</p></section>
    <section class="pane reveal"><h2>Against a human tutor</h2><p>A tutor offers a relationship and human judgement no app can copy. Katzu offers practice at any time for one yearly price, but it is not a replacement for a tutor and issues no certificate.</p></section>
    <section class="pane reveal"><h2>Against exam-prep courses</h2><p>Official exam courses train the official format. Katzu builds the A0–B2 foundation through conversation, and exam-format practice is being built — measurable before published, never promised early.</p></section>
  </div>
  <div class="callout reveal"><h2>What we do not claim</h2><p>No ratings, testimonials, user counts or awards. No guaranteed exam pass or job offer. Only what can be checked in the app and its policies.</p></div>
  <p class="reveal" style="margin-top:30px"><a class="btn" href="/en/pricing">See what you get</a> <a class="btn gh" href="/en/who-its-for">Who it is for</a></p>
</div>`,
  },
  {
    path: '/en/use-cases/moving-to-germany',
    title: 'German practice for moving to Germany — real situations',
    description:
      'Practise German for the situations that follow a move to Germany: embassy, doctor, job interview, apartment viewing, airport, café. A0–B2, Arabic-first.',
    h1: 'German practice for moving to Germany',
    lead:
      'Moving to Germany puts you in situations that need clear, quick German, not only exam German. Katzu practises those situations by voice or text, with Arabic explanations of what the other person is saying.',
    body: `
<div class="wrap prose">
  <div class="callout reveal"><h2>The six published situations</h2><ul>
    <li><b>The embassy:</b> an appointment with the clerk — <span lang="de" class="de">Warum möchten Sie nach Deutschland?</span></li>
    <li><b>The doctor:</b> a German practice — <span lang="de" class="de">Wo genau tut es weh?</span></li>
    <li><b>A job interview:</b> with a German hiring manager — <span lang="de" class="de">Erzählen Sie etwas über sich.</span></li>
    <li><b>An apartment viewing:</b> with the landlord — <span lang="de" class="de">Wann können Sie einziehen?</span></li>
    <li><b>The airport:</b> arrival and entry — <span lang="de" class="de">Was ist der Zweck Ihrer Reise?</span></li>
    <li><b>The café:</b> ordering in a German café — <span lang="de" class="de">Ich möchte bitte einen Kaffee.</span></li>
  </ul></div>
  <div class="callout reveal"><h2>How to use it for a move</h2><p>Pick the situation closest to your next appointment, hear the sentence, then speak. Afterwards every mistake returns in four review stops — today, days, week, month — until you say it without thinking.</p></div>
  <div class="callout reveal"><h2>Clear limits</h2><p>Katzu is not an immigration office, a lawyer or a legal adviser, and it does not act for you with official bodies. It issues no certificate, visa or work contract. For official decisions use the responsible authority.</p></div>
  <p class="reveal" style="margin-top:30px"><a class="btn" href="${START}">Start free</a> <a class="btn gh" href="/en/faq">Read the FAQ</a></p>
</div>`,
  },
  {
    path: '/en/pricing',
    title: 'Katzu pricing — free tier and Pro',
    description:
      'What the free Katzu tier includes (3 AI lessons a month), what Pro adds (a full year for 60 dollars with coupon), and how refunds work: full within the first 7 days.',
    h1: 'Start free. Subscribe when you want more.',
    lead: 'Free is not a two-day trial: your lessons refresh every month. Mastery needs a daily conversation.',
    body: `
<div class="wrap prose" style="max-width:860px">
  <div class="tiers reveal" style="text-align:start">
    <article class="tier glass"><h3>Free forever</h3><p style="font:900 1.8rem Cairo">0 dollars</p><ul>
      <li>3 AI lessons every month after sign-up.</li>
      <li>Daily mission and spaced review.</li>
      <li>Placement test and mistake bank.</li>
      <li>No bank card.</li>
    </ul><a class="btn gh" href="${START}">Start free</a></article>
    <article class="tier f glass"><span class="save">Limited-time offer — ends 31 January 2027</span><h3>A full year</h3><p style="font:900 1.8rem Cairo">60 dollars</p><ul>
      <li>Less than 17 cents a day.</li>
      <li>Every situation and level from A0 to B2.</li>
      <li>Vocabulary and grammar banks.</li>
      <li>Daily conversation under a fair-use ceiling, no sudden lock.</li>
      <li>Full refund within the first 7 days.</li>
    </ul><button class="cp" type="button" data-copy="${COUPON}">Coupon <span class="de">${COUPON}</span> · copy</button><a class="btn mag" href="${SUBSCRIBE}">Subscribe yearly</a></article>
  </div>
  <div class="callout reveal"><h2>Payment and the code</h2><p>Payment works without a bank card; your activation code arrives within 12 hours at the latest and is redeemed inside the app. We never ask for card details in the app, and there is no surprise auto-renewal.</p></div>
  <div class="callout reveal"><h2>Refunds</h2><p>Within the first 7 days of your subscription you get a full refund if Katzu does not suit you; after that paid amounts are not refunded. <a class="inline" href="/trust/refund">Read the refund page</a> in full.</p></div>
  <div class="callout reveal"><h2>Fair use</h2><p>A daily ceiling protects the service from abuse and does not touch normal use; you see it in the app before you reach it — announced, not hidden.</p></div>
  <p class="reveal" style="margin-top:30px"><a class="btn" href="${START}">Start free</a> <a class="btn gh" href="/en/faq">Questions before you pay</a></p>
</div>`,
  },
  {
    path: '/en/faq',
    title: 'Katzu FAQ',
    description:
      'Frequently asked questions about Katzu: starting free, free vs Pro, voice or text, privacy, payment and refunds, and exams.',
    h1: 'Questions before you start',
    lead: 'Questions we are actually asked, with short, honest answers. If yours is missing, contact support.',
    faq: 'en',
    body: `<div class="wrap faq-block reveal"><p class="notice">Question not here? <a href="mailto:${SUPPORT}">${SUPPORT}</a></p></div>`,
  },
  {
    path: '/en/about',
    title: 'About Katzu — who we are and how to contact us',
    description:
      'About Katzu: an Arabic-first German conversation app built by Ghaidak Alloush. Support, privacy, terms and contact links.',
    h1: 'About Katzu',
    lead:
      'Katzu is an Arabic-first German learning app built around speaking, for Arabic speakers who need German in everyday life in Germany. The product is independent; the interface is Arabic-first and German is the practice language.',
    body: `
<div class="wrap prose">
  <div class="cols2">
    <section class="pane reveal"><h2>Who builds Katzu?</h2><p>Katzu is built by <b>Ghaidak Alloush</b> (<a class="inline" href="https://ghaidak.com" rel="noopener">ghaidak.com</a>). No ratings, testimonials, user counts or awards are shown here, because we have not collected them and cannot prove them.</p></section>
    <section class="pane reveal"><h2>How to contact us</h2><p>For support and questions: <a class="inline" href="mailto:${SUPPORT}">${SUPPORT}</a>. We never ask for a password, a login code or a card number by email.</p></section>
  </div>
  <div class="callout reveal"><h2>Useful links</h2><ul class="link-list">
    <li><a class="inline" href="/en/how-it-works">How it works</a></li>
    <li><a class="inline" href="/en/who-its-for">Who Katzu is for</a></li>
    <li><a class="inline" href="/en/compare">An honest comparison</a></li>
    <li><a class="inline" href="/en/pricing">Free and Pro</a></li>
    <li><a class="inline" href="/en/faq">FAQ</a></li>
    <li><a class="inline" href="/trust/privacy" hreflang="ar" lang="ar">Privacy (Arabic)</a></li>
    <li><a class="inline" href="/trust/terms" hreflang="ar" lang="ar">Terms (Arabic)</a></li>
    <li><a class="inline" href="/trust/contact" hreflang="ar" lang="ar">Contact (Arabic)</a></li>
  </ul></div>
  <p class="notice reveal">Page last updated: ${UPDATED}.</p>
</div>`,
  },
];
