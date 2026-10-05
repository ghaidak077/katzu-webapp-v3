# Deferred — design notes, no build

Five features were deliberately not built in this cycle. Each note says what it
would take, what it would cost the learner or the owner if shipped carelessly,
and what has to be true before it is worth building. Nothing here is a promise
and nothing here is half-implemented: there is no flag, no stub route and no
placeholder UI for any of them.

---

## Email OTP (sign-in without Google)

**What it is.** Replace Sign-in with Google as the only way in, or add a second
door: the learner types an email address and receives a six-digit code, proving
control of that mailbox. **Why it is worth considering.** Google sign-in is a hard
dependency on one provider with one button; in Egypt, Syria and Iraq, accounts
that work on Android do not always work on every browser, and a learner who
cannot sign in cannot reach a single minute of their course. Email OTP would
remove that as a failure mode and would also let an owner sell to a learner who
has never used Google. **What it costs.** It moves the hardest part of
authentication — proving a human controls an address — onto infrastructure this
project does not have: an outbound email provider, bounce and abuse handling,
a rate limit per address and per IP, a code lifetime, a hashed-code store that
survives retries, and a recovery story when the mailbox is gone. Every one of
those is a way to either lock out a paying learner or hand an attacker an
account takeover. There is no test that can tell you the abuse ceiling is right;
it is found out in production, by an attacker, before you do. **What would make
it worth building.** A real bounce rate on a transactional-email plan, a written
abuse model, and a decision that email accounts and Google accounts can be the
*same* account (they cannot be trivially: matching them by email address is a
takeover vector). Until then, one strong identity provider beats two weak ones.

## Web push (a daily reminder that reaches the learner)

**What it is.** A `push` service worker subscription, VAPID keys, and a server
that sends one Arabic message a day — "بقيت عشر دقائق اليوم" — to a phone that
has the app installed but has not opened it. **Why it is worth considering.**
The daily-visit habit is the entire business model of a subscription, and the
in-app `.ics` reminder added this cycle only works if the learner opens the
calendar. Push works on a phone in a pocket. **What it costs.** A permission
prompt shown at the wrong moment is the single most reliable way to lose an
install permanently, and there is no undo: the answer is remembered. It also
needs VAPID key management (generate, store, rotate, revoke), a subscription
table with expiry, a delivery path that can be rate-limited by push providers
themselves, and a policy for what happens when a learner has hundreds of stale
subscriptions. **What would make it worth building.** Evidence that the in-app
reminder and the share card are not enough — i.e. a measured D7 retention figure
to compare against. That measurement does not exist yet, so this is the right
order of work: measure first, ask permission second.

## Play Billing (paying inside the Play app)

**What it is.** Route the existing one-time products (`pass90`, `monthly`,
`mock`) through Google Play's billing instead of a code the buyer activates. Play
requires it for digital goods sold inside a Play-distributed app, takes a cut,
and settles in a currency and a schedule the current price table does not model.
**Why it is worth considering.** It removes the manual step that costs real
money: a code typed in by hand, from an email, by a learner on a phone. It also
makes regional pricing automatic, in local currencies, at local price points,
which is close to what the region-aware table is trying to approximate. **What it
costs.** The price table that took Batch 2 to build becomes a second source of
truth, because Play owns the price in the app and the table owns it on the web —
and they will drift. Refunds become a Play-side flow, so the `{{OWNER_FILL}}`
refund text is no longer the whole story. Entitlement becomes a Play purchase
verification call rather than an HMAC code, so the redemption path is replaced,
not extended. And the sandbox/live split is a second environment to keep honest.
**What would make it worth building.** A Play-distributed build existing at all.
Today there is no TWA, no package name and no signing fingerprint, and the
assetlinks file is an empty list on purpose. Build billing only after the app
exists on the store.

## Domain switch (`katzu.app` → a domain that resolves)

**What it is.** Buy a real domain, point it at the Pages project, and make
`VITE_PUBLIC_APP_URL` follow. **Why it is worth considering.** `katzu.app` does
not resolve, and the app is currently served from a `*.pages.dev` URL, which
every learner-visible artefact — the origin the app is installed from, the
sitemap, the share links, the assetlinks statement, the OAuth consent screen —
currently inherits. A learner's browser history, their saved shortcuts and the
house ad on their phone will all carry `pages.dev` until this is done. **What it
costs.** Almost nothing technically, which is why it keeps getting deferred: it
is a purchase decision, not an engineering one, and it cannot be made from inside
a build. The one real risk is doing it half-way — changing the origin while
`assetlinks.json`, the OAuth client and the sitemap disagree. **What would make
it worth building.** The owner's decision and the money. When it happens, the
order is: domain → DNS → `VITE_PUBLIC_APP_URL` → Google OAuth authorised origin
→ one build → verify `/health`, the sitemap and the manifest, and only then treat
the `pages.dev` URL as the fallback rather than the other way round.

## Play wrapper (TWA / Play "web app" listing)

**What it is.** A thin Android shell, ideally a Trusted Web Activity, that
launches the same URL with the native install surface: app icon, splash screen,
Play listing, store reviews, and Digital Asset Links binding the browser
identity to the app identity. **Why it is worth considering.** It is the only
route to a store listing, store updates, and Play Billing, and it is what makes
"install Katzu" a normal thing to ask. **What it costs.** Two signing keys and
their lifetimes, a Play developer account, and an update path that is no longer
"push and it is live": a store release is a review, and a broken release cannot
be pulled back as fast as a Pages deployment. It also creates the dangerous
possibility of an installed shell pointing at a URL whose assetlinks statement is
empty, which is the failure mode this cycle deliberately left visible rather than
papered over with a placeholder fingerprint. **What would make it worth
building.** An owner who wants the store, a real package name, a real signing
fingerprint in `VITE_ANDROID_CERT_SHA256`, and a version of the app that is
genuinely worth a review queue. It is the last item in this list, not the first,
because every one of the four items above either depends on it or is made better
by knowing whether it will exist.